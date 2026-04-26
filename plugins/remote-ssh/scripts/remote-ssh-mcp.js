#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const SERVER_VERSION = "0.3.0";
const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 15;
const DEFAULT_COMMAND_TIMEOUT_MS = 120000;

const DEFAULT_BLOCKED_COMMAND_PATTERNS = [
  "\\brm\\s+-rf\\b",
  "\\bmkfs\\b",
  "\\bdd\\s+if=",
  "\\bshutdown\\b",
  "\\breboot\\b",
  "\\bhalt\\b",
  "\\bpoweroff\\b",
  "\\b:>\\s*/",
  "\\bchmod\\s+-R\\s+777\\b",
  "\\bchown\\s+-R\\b",
  "\\bpasswd\\b",
  "\\buserdel\\b",
  "\\bgroupdel\\b",
  "\\biptables\\b",
  "\\bufw\\s+disable\\b",
  "\\bsetenforce\\s+0\\b",
];

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function expandHome(filePath) {
  if (!filePath) return filePath;
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw || "{}");
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }
}

function defaultConfigFile() {
  return path.join(os.homedir(), ".codex", "remote-ssh-hosts.json");
}

function activeConfigFile() {
  return expandHome(process.env.REMOTE_SSH_CONFIG_FILE || defaultConfigFile());
}

function ensureConfigShape(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { hosts: {} };
  }
  if (config.hosts && typeof config.hosts === "object" && !Array.isArray(config.hosts)) {
    return config;
  }
  return { hosts: config };
}

function loadHostConfig() {
  const configFile = process.env.REMOTE_SSH_CONFIG_FILE;
  if (configFile) {
    const resolved = expandHome(configFile);
    const parsed = parseJson(fs.readFileSync(resolved, "utf8"), `REMOTE_SSH_CONFIG_FILE ${resolved}`);
    return parsed.hosts || parsed;
  }

  const envHosts = process.env.REMOTE_SSH_HOSTS;
  if (envHosts) {
    return parseJson(envHosts, "REMOTE_SSH_HOSTS");
  }

  const resolved = defaultConfigFile();
  if (!fs.existsSync(resolved)) return {};
  const parsed = parseJson(fs.readFileSync(resolved, "utf8"), resolved);
  return parsed.hosts || parsed;
}

function readWritableConfig() {
  const resolved = activeConfigFile();
  if (!fs.existsSync(resolved)) return { file: resolved, config: { hosts: {} } };
  return {
    file: resolved,
    config: ensureConfigShape(parseJson(fs.readFileSync(resolved, "utf8"), resolved)),
  };
}

function writeWritableConfig(file, config) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function parseSshHost(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("SSH host is required.");
  if (value.includes("@")) {
    const [user, ...hostParts] = value.split("@");
    const host = hostParts.join("@");
    if (!user || !host) throw new Error("SSH host must look like user@hostname.");
    return { user, host };
  }
  return { sshConfigHost: value };
}

function cleanHostProfile(args) {
  const parsed = parseSshHost(args.sshHost);
  const profile = {
    ...parsed,
    port: args.port || 22,
    identityFile: args.identityFile || undefined,
    allowedPaths: Array.isArray(args.allowedPaths) ? args.allowedPaths : [],
    allowWrites: Boolean(args.allowWrites),
    strictHostKeyChecking: args.strictHostKeyChecking !== false,
    connectTimeoutSeconds: args.connectTimeoutSeconds || DEFAULT_CONNECT_TIMEOUT_SECONDS,
    commandTimeoutMs: args.commandTimeoutMs || DEFAULT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: args.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
  };

  return Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined));
}

function getHost(alias) {
  if (!alias || typeof alias !== "string") {
    throw new Error("A host alias is required.");
  }

  const hosts = loadHostConfig();
  const config = hosts[alias];
  if (!config) {
    throw new Error(`Unknown remote host alias: ${alias}`);
  }
  if (!config.host && !config.sshConfigHost) {
    throw new Error(`Host alias ${alias} must include host or sshConfigHost.`);
  }
  if (!config.user && !config.sshConfigHost) {
    throw new Error(`Host alias ${alias} must include user unless sshConfigHost is used.`);
  }

  return {
    alias,
    port: 22,
    connectTimeoutSeconds: DEFAULT_CONNECT_TIMEOUT_SECONDS,
    commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
    strictHostKeyChecking: true,
    allowCommandExecution: true,
    allowWrites: false,
    allowedPaths: [],
    allowedCommands: [],
    blockedCommandPatterns: DEFAULT_BLOCKED_COMMAND_PATTERNS,
    ...config,
  };
}

function redactConfig(config) {
  const safe = { ...config };
  if (safe.identityFile) safe.identityFile = "[configured]";
  if (safe.proxyJump) safe.proxyJump = "[configured]";
  return safe;
}

function audit(event) {
  const auditPath = process.env.REMOTE_SSH_AUDIT_LOG;
  if (!auditPath) return;

  const record = {
    timestamp: new Date().toISOString(),
    plugin: "remote-ssh",
    version: SERVER_VERSION,
    ...event,
  };
  fs.appendFileSync(expandHome(auditPath), `${JSON.stringify(record)}\n`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeRemotePath(remotePath) {
  if (!remotePath || typeof remotePath !== "string") {
    throw new Error("Remote path must be a non-empty string.");
  }
  if (!remotePath.startsWith("/")) {
    throw new Error(`Remote path must be absolute: ${remotePath}`);
  }
  return path.posix.normalize(remotePath);
}

function assertPathAllowed(config, remotePath, operation) {
  const normalized = normalizeRemotePath(remotePath);
  if (!config.allowedPaths || config.allowedPaths.length === 0) {
    return normalized;
  }

  const allowed = config.allowedPaths.some((prefix) => {
    const normalizedPrefix = path.posix.normalize(prefix);
    return normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`);
  });

  if (!allowed) {
    throw new Error(`${operation} denied by path policy for ${config.alias}: ${normalized}`);
  }

  return normalized;
}

function assertCommandAllowed(config, command) {
  if (!config.allowCommandExecution) {
    throw new Error(`Command execution is disabled for host alias ${config.alias}.`);
  }
  if (!command || typeof command !== "string") {
    throw new Error("Command must be a non-empty string.");
  }

  if (Array.isArray(config.allowedCommands) && config.allowedCommands.length > 0) {
    const allowed = config.allowedCommands.some((prefix) => command.trim().startsWith(prefix));
    if (!allowed) {
      throw new Error(`Command denied by allowlist for host alias ${config.alias}.`);
    }
  }

  const blocked = (config.blockedCommandPatterns || []).find((pattern) => {
    return new RegExp(pattern, "i").test(command);
  });
  if (blocked) {
    throw new Error(`Command denied by policy for host alias ${config.alias}: ${blocked}`);
  }
}

function sshArgs(config, remoteCommand) {
  const args = [];
  if (config.identityFile) args.push("-i", expandHome(config.identityFile));
  if (config.port && !config.sshConfigHost) args.push("-p", String(config.port));
  if (config.knownHostsFile) args.push("-o", `UserKnownHostsFile=${expandHome(config.knownHostsFile)}`);
  if (config.proxyJump) args.push("-J", config.proxyJump);
  args.push("-o", "BatchMode=yes");
  args.push("-o", `ConnectTimeout=${config.connectTimeoutSeconds}`);
  args.push("-o", `StrictHostKeyChecking=${config.strictHostKeyChecking === false ? "no" : "yes"}`);

  const target = config.sshConfigHost || `${config.user}@${config.host}`;
  args.push(target, remoteCommand);
  return args;
}

function runSsh(config, remoteCommand, toolName) {
  const maxOutputBytes = Number(config.maxOutputBytes) || numberFromEnv("REMOTE_SSH_MAX_OUTPUT_BYTES", DEFAULT_MAX_OUTPUT_BYTES);
  const timeoutMs = Number(config.commandTimeoutMs) || DEFAULT_COMMAND_TIMEOUT_MS;
  const startedAt = Date.now();

  audit({
    phase: "start",
    tool: toolName,
    hostAlias: config.alias,
    target: config.host || config.sshConfigHost,
    command: remoteCommand,
  });

  return new Promise((resolve) => {
    const child = spawn("ssh", sshArgs(config, remoteCommand), {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk]).subarray(0, maxOutputBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr = Buffer.concat([stderr, chunk]).subarray(0, maxOutputBytes);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const result = {
        exitCode: 127,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message,
      };
      audit({ phase: "finish", tool: toolName, hostAlias: config.alias, ...result });
      resolve(result);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const result = {
        exitCode: timedOut ? 124 : exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
      };
      audit({ phase: "finish", tool: toolName, hostAlias: config.alias, exitCode: result.exitCode, timedOut, durationMs: result.durationMs });
      resolve(result);
    });
  });
}

function textResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

const tools = [
  {
    name: "remote_add_host",
    description: "Add or update a saved SSH connection profile in the Remote SSH config file.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Friendly connection name, used as the host alias." },
        sshHost: { type: "string", description: "user@hostname or a host alias from ~/.ssh/config." },
        port: { type: "integer", minimum: 1, maximum: 65535, default: 22 },
        identityFile: { type: "string", description: "Optional private key path. Supports ~." },
        allowedPaths: {
          type: "array",
          items: { type: "string" },
          description: "Optional remote path allowlist for file tools.",
          default: [],
        },
        allowWrites: { type: "boolean", default: false },
        strictHostKeyChecking: { type: "boolean", default: true },
        connectTimeoutSeconds: { type: "integer", minimum: 1, default: 15 },
        commandTimeoutMs: { type: "integer", minimum: 1000, default: 120000 },
        maxOutputBytes: { type: "integer", minimum: 1024, default: 1048576 },
        overwrite: { type: "boolean", default: false },
      },
      required: ["name", "sshHost"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_remove_host",
    description: "Remove a saved SSH connection profile from the Remote SSH config file.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Host alias to remove." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_test_connection",
    description: "Test a configured SSH connection with a small non-interactive command.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Configured host alias." },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_hosts",
    description: "List configured SSH host aliases and their non-secret policy metadata.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "remote_run",
    description: "Run a non-interactive command on a configured SSH host alias.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Configured host alias." },
        command: { type: "string", description: "Remote shell command to run." },
      },
      required: ["host", "command"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_read_file",
    description: "Read a UTF-8 text file from a configured SSH host.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        path: { type: "string", description: "Absolute remote file path." },
      },
      required: ["host", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_list_dir",
    description: "List a directory on a configured SSH host.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        path: { type: "string", description: "Absolute remote directory path." },
      },
      required: ["host", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_stat",
    description: "Return file metadata for a path on a configured SSH host.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        path: { type: "string", description: "Absolute remote path." },
      },
      required: ["host", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_tail_file",
    description: "Read the last lines of a remote log or text file.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        path: { type: "string", description: "Absolute remote file path." },
        lines: { type: "integer", minimum: 1, maximum: 2000, default: 200 },
      },
      required: ["host", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_write_file",
    description: "Write a UTF-8 text file on a configured SSH host. Requires allowWrites=true for that host.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        path: { type: "string", description: "Absolute remote file path." },
        content: { type: "string", description: "UTF-8 text content to write." },
        overwrite: { type: "boolean", description: "Allow replacing an existing file.", default: false },
      },
      required: ["host", "path", "content"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args) {
  if (name === "remote_add_host") {
    const alias = String(args.name || "").trim();
    if (!alias || !/^[A-Za-z0-9_.-]+$/.test(alias)) {
      throw new Error("Connection name must contain only letters, numbers, dots, underscores, or hyphens.");
    }
    const { file, config } = readWritableConfig();
    if (config.hosts[alias] && !args.overwrite) {
      throw new Error(`Connection ${alias} already exists. Pass overwrite=true to update it.`);
    }
    config.hosts[alias] = cleanHostProfile(args);
    writeWritableConfig(file, config);
    return textResult({
      saved: true,
      name: alias,
      configFile: file,
      profile: redactConfig({ alias, ...config.hosts[alias] }),
    });
  }

  if (name === "remote_remove_host") {
    const alias = String(args.name || "").trim();
    const { file, config } = readWritableConfig();
    if (!config.hosts[alias]) {
      throw new Error(`Connection ${alias} does not exist in ${file}.`);
    }
    delete config.hosts[alias];
    writeWritableConfig(file, config);
    return textResult({ removed: true, name: alias, configFile: file });
  }

  if (name === "remote_hosts") {
    const hosts = loadHostConfig();
    return textResult({
      hosts: Object.fromEntries(
        Object.entries(hosts).map(([alias, config]) => [alias, redactConfig({ alias, ...config })]),
      ),
    });
  }

  const config = getHost(args.host);

  if (name === "remote_test_connection") {
    return textResult(await runSsh(config, "printf 'connected\\n'; hostname; whoami", name));
  }

  if (name === "remote_run") {
    assertCommandAllowed(config, args.command);
    return textResult(await runSsh(config, args.command, name));
  }
  if (name === "remote_read_file") {
    const remotePath = assertPathAllowed(config, args.path, "read");
    return textResult(await runSsh(config, `cat -- ${shellQuote(remotePath)}`, name));
  }
  if (name === "remote_list_dir") {
    const remotePath = assertPathAllowed(config, args.path, "list");
    return textResult(await runSsh(config, `ls -la -- ${shellQuote(remotePath)}`, name));
  }
  if (name === "remote_stat") {
    const remotePath = assertPathAllowed(config, args.path, "stat");
    return textResult(await runSsh(config, `stat -- ${shellQuote(remotePath)}`, name));
  }
  if (name === "remote_tail_file") {
    const remotePath = assertPathAllowed(config, args.path, "tail");
    const lines = Math.max(1, Math.min(Number(args.lines || 200), 2000));
    return textResult(await runSsh(config, `tail -n ${lines} -- ${shellQuote(remotePath)}`, name));
  }
  if (name === "remote_write_file") {
    if (!config.allowWrites) {
      throw new Error(`Writes are disabled for host alias ${config.alias}. Set allowWrites=true to enable.`);
    }
    const remotePath = assertPathAllowed(config, args.path, "write");
    const encoded = Buffer.from(args.content, "utf8").toString("base64");
    const operator = args.overwrite ? ">" : ">";
    const guard = args.overwrite ? "" : `test ! -e ${shellQuote(remotePath)} && `;
    const writeCommand = `${guard}printf %s ${shellQuote(encoded)} | base64 -d ${operator} ${shellQuote(remotePath)}`;
    return textResult(await runSsh(config, writeCommand, name));
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handle(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "remote-ssh", version: SERVER_VERSION },
    };
  }
  if (request.method === "tools/list") {
    return { tools };
  }
  if (request.method === "tools/call") {
    return callTool(request.params.name, request.params.arguments || {});
  }
  if (request.method === "notifications/initialized") {
    return {};
  }
  return {};
}

function writeResponse(id, result) {
  if (id === undefined || id === null) return;
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function writeError(id, error) {
  if (id === undefined || id === null) return;
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: error.message },
    }) + "\n",
  );
}

function startServer() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handle(request);
      writeResponse(request.id, result);
    } catch (error) {
      writeError(request && request.id, error);
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  assertCommandAllowed,
  assertPathAllowed,
  cleanHostProfile,
  defaultConfigFile,
  expandHome,
  handle,
  loadHostConfig,
  normalizeRemotePath,
  shellQuote,
  startServer,
  tools,
};
