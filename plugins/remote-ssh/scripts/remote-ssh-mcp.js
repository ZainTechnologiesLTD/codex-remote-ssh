#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const SERVER_VERSION = "0.6.1";
const PROTOCOL_VERSION = "2024-11-05";
const FOLDER_PICKER_TEMPLATE_URI = "ui://remote-ssh/folder-picker.html";
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
  const allowedPaths = Array.isArray(args.allowedPaths) ? args.allowedPaths : [];
  const profile = {
    ...parsed,
    port: args.port || 22,
    identityFile: args.identityFile || undefined,
    workspaceRoot: args.workspaceRoot || undefined,
    allowedPaths: allowedPaths.length > 0 ? allowedPaths : args.workspaceRoot ? [args.workspaceRoot] : [],
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

  const resolved = expandHome(auditPath);
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.appendFileSync(resolved, `${JSON.stringify(record)}\n`);
  } catch (error) {
    process.stderr.write(`remote-ssh: audit log write failed (${error.message})\n`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function base64Text(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
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

function resolveRemoteWorkspacePath(config, root, relativePath, operation) {
  const workspaceRoot = normalizeRemotePath(root || config.workspaceRoot || "/");
  assertPathAllowed(config, workspaceRoot, operation);

  const requested = relativePath ? String(relativePath) : ".";
  if (requested.startsWith("/")) {
    return assertPathAllowed(config, requested, operation);
  }

  const resolved = path.posix.normalize(path.posix.join(workspaceRoot, requested));
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}/`)) {
    throw new Error(`${operation} denied because path escapes workspace root: ${requested}`);
  }

  return assertPathAllowed(config, resolved, operation);
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
    try {
      return new RegExp(pattern, "i").test(command);
    } catch {
      return false;
    }
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
    structuredContent: typeof payload === "string" ? { text: payload } : payload,
  };
}

function widgetResult(payload, templateUri) {
  return {
    ...textResult(payload),
    _meta: {
      "openai/outputTemplate": templateUri,
      "mcpui/resourceUri": templateUri,
      "mcpui/toolInvocation/invoking": "Opening remote folder picker",
      "mcpui/toolInvocation/invoked": "Remote folder picker ready",
    },
  };
}

function parseRemoteDirectoryEntries(stdout, parentPath) {
  return String(stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, absolutePath, mode, owner, group, modified] = line.split("\t");
      return {
        name,
        path: absolutePath,
        type: "directory",
        permissions: mode,
        owner,
        group,
        modified,
      };
    })
    .filter((entry) => entry.name && entry.path && entry.path !== parentPath)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildBrowseDirCommand(remotePath, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 200), 1000));
  const quotedPath = shellQuote(remotePath);
  return [
    `test -d ${quotedPath}`,
    `cd ${quotedPath}`,
    [
      "find . -maxdepth 1 -mindepth 1 -type d",
      "-printf '%f\\t%p\\t%m\\t%u\\t%g\\t%TY-%Tm-%Td %TH:%TM\\n'",
      "| sort",
      `| head -n ${safeLimit}`,
      "| awk -F '\\t' -v root=\"$PWD\" 'BEGIN { OFS=\"\\t\" } { if ($2 == \"./\" $1) $2=root \"/\" $1; print }'",
    ].join(" "),
  ].join(" && ");
}

function selectWorkspaceInConfig(config, alias, workspacePath, seedProfile) {
  const normalized = normalizeRemotePath(workspacePath);
  const existing = config.hosts[alias];
  if (!existing && !seedProfile) {
    throw new Error(`Connection ${alias} does not exist.`);
  }
  const base = existing ? { ...existing } : { ...seedProfile };
  delete base.alias;
  const allowedPaths = Array.isArray(base.allowedPaths) ? [...base.allowedPaths] : [];
  if (!allowedPaths.includes(normalized)) {
    allowedPaths.push(normalized);
  }
  config.hosts[alias] = {
    ...base,
    workspaceRoot: normalized,
    allowedPaths,
  };
  return config.hosts[alias];
}

function classifySshFailure(result) {
  const stderr = String(result.stderr || "");
  if (result.exitCode === 0) return "connected";
  if (/permission denied/i.test(stderr)) return "password_or_key_required";
  if (/connection refused/i.test(stderr)) return "connection_refused";
  if (/operation timed out|connection timed out|connecttimeout/i.test(stderr)) return "timeout";
  if (/could not resolve hostname|name or service not known/i.test(stderr)) return "host_not_found";
  if (/host key verification failed/i.test(stderr)) return "host_key_verification_failed";
  return "failed";
}

const folderPickerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Remote SSH Folder Picker</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    .shell { padding: 16px; display: grid; gap: 12px; }
    .bar { display: grid; grid-template-columns: minmax(140px, 220px) 1fr auto; gap: 8px; align-items: center; }
    select, input, button { font: inherit; min-height: 34px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 6px; background: Canvas; color: CanvasText; }
    select, input { padding: 0 10px; }
    button { padding: 0 12px; cursor: pointer; }
    button.primary { background: #2563eb; border-color: #2563eb; color: white; }
    .crumbs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 13px; }
    .crumbs button { min-height: 28px; padding: 0 8px; }
    .list { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; overflow: hidden; }
    .row { display: grid; grid-template-columns: 1fr 86px 96px 142px; gap: 8px; align-items: center; padding: 9px 10px; border-top: 1px solid color-mix(in srgb, CanvasText 10%, transparent); }
    .row:first-child { border-top: 0; }
    .row:hover { background: color-mix(in srgb, CanvasText 7%, transparent); }
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .muted { color: color-mix(in srgb, CanvasText 62%, transparent); font-size: 12px; }
    .empty, .error { padding: 14px; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; }
    .error { border-color: #dc2626; color: #dc2626; }
    @media (max-width: 640px) {
      .bar { grid-template-columns: 1fr; }
      .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="bar">
      <select id="host"></select>
      <input id="path" value="/home" aria-label="Remote path" />
      <button id="go">Open</button>
    </div>
    <div id="crumbs" class="crumbs"></div>
    <div class="bar">
      <div class="muted" id="status">Choose a host and folder.</div>
      <span></span>
      <button class="primary" id="select">Select this folder</button>
    </div>
    <section id="content" class="list"></section>
  </main>
  <script>
    const state = { hosts: {}, host: "", path: "/home", entries: [] };
    const rpc = (() => {
      let id = 1;
      const pending = new Map();
      window.addEventListener("message", (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;
        if (message.id && pending.has(message.id)) {
          const { resolve, reject } = pending.get(message.id);
          pending.delete(message.id);
          message.error ? reject(new Error(message.error.message)) : resolve(message.result);
        }
        if (message.method === "ui/notifications/tool-result") {
          hydrate(message.params?.structuredContent);
        }
      });
      return (method, params) => new Promise((resolve, reject) => {
        const request = { jsonrpc: "2.0", id: id++, method, params };
        pending.set(request.id, { resolve, reject });
        window.parent.postMessage(request, "*");
      });
    })();
    function hydrate(data) {
      if (!data) return;
      if (data.hosts) state.hosts = data.hosts;
      if (data.selectedHost) state.host = data.selectedHost;
      if (data.path) state.path = data.path;
      if (data.entries) state.entries = data.entries;
      render();
    }
    function render() {
      const host = document.getElementById("host");
      host.innerHTML = Object.keys(state.hosts).map((name) => '<option value="' + esc(name) + '">' + esc(name) + '</option>').join("");
      host.value = state.host || Object.keys(state.hosts)[0] || "";
      state.host = host.value;
      document.getElementById("path").value = state.path;
      document.getElementById("status").textContent = state.host ? state.host + ":" + state.path : "No saved hosts.";
      const parts = state.path.split("/").filter(Boolean);
      let current = "";
      document.getElementById("crumbs").innerHTML = ['<button data-path="/">/</button>'].concat(parts.map((part) => {
        current += "/" + part;
        return '<button data-path="' + esc(current) + '">' + esc(part) + '</button>';
      })).join("");
      const content = document.getElementById("content");
      content.innerHTML = state.entries.length ? state.entries.map((entry) =>
        '<div class="row" data-path="' + esc(entry.path) + '"><div><div class="name">' + esc(entry.name) + '</div><div class="muted">' + esc(entry.path) + '</div></div><div class="muted">' + esc(entry.permissions || "") + '</div><div class="muted">' + esc(entry.owner || "") + '</div><div class="muted">' + esc(entry.modified || "") + '</div></div>'
      ).join("") : '<div class="empty">No child directories found.</div>';
    }
    async function browse(path) {
      try {
        document.getElementById("status").textContent = "Loading...";
        const result = await rpc("tools/call", { name: "remote_browse_dir", arguments: { host: state.host, path } });
        hydrate(result.structuredContent);
      } catch (error) {
        document.getElementById("content").innerHTML = '<div class="error">' + esc(error.message) + '</div>';
      }
    }
    document.getElementById("host").addEventListener("change", (event) => { state.host = event.target.value; browse(state.path); });
    document.getElementById("go").addEventListener("click", () => browse(document.getElementById("path").value));
    document.getElementById("select").addEventListener("click", async () => {
      const result = await rpc("tools/call", { name: "remote_select_workspace", arguments: { host: state.host, path: state.path } });
      hydrate(result.structuredContent);
      await rpc("ui/update-model-context", { content: [{ type: "text", text: "Remote SSH workspace selected: " + state.host + ":" + state.path }] });
    });
    document.getElementById("content").addEventListener("click", (event) => {
      const row = event.target.closest(".row");
      if (row) browse(row.dataset.path);
    });
    document.getElementById("crumbs").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-path]");
      if (button) browse(button.dataset.path);
    });
    function esc(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    render();
  </script>
</body>
</html>`;

const tools = [
  {
    name: "remote_render_folder_picker",
    description: "Render the visual Remote SSH folder picker UI for saved hosts.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Optional saved host alias to preselect." },
        path: { type: "string", description: "Optional absolute remote path to open first.", default: "/home" },
      },
      additionalProperties: false,
    },
    _meta: {
      "openai/outputTemplate": FOLDER_PICKER_TEMPLATE_URI,
      "mcpui/resourceUri": FOLDER_PICKER_TEMPLATE_URI,
    },
  },
  {
    name: "remote_connection_wizard",
    description: "Add SSH connection using the simple user-facing form: Name, SSH Host, SSH Port, and Identity File.",
    inputSchema: {
      type: "object",
      title: "Add SSH connection",
      description: "Connect to a remote machine for Codex remote work.",
      properties: {
        name: {
          type: "string",
          title: "Name",
          description: "A friendly name for this SSH connection, such as My Server.",
        },
        sshHost: {
          type: "string",
          title: "SSH Host",
          description: "user@myserver.com or a host from ~/.ssh/config.",
        },
        port: {
          type: "integer",
          title: "SSH Port",
          description: "Leave empty to use default 22 or SSH config.",
          minimum: 1,
          maximum: 65535,
          default: 22,
        },
        identityFile: {
          type: "string",
          title: "Identity File (Private Key)",
          description: "Leave empty to use default SSH key or SSH config. Example: ~/.ssh/id_rsa.",
        },
      },
      required: ["name", "sshHost"],
      additionalProperties: false,
    },
  },
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
        workspaceRoot: { type: "string", description: "Optional default remote project/workspace root." },
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
    name: "remote_connection_auth_check",
    description: "Check whether a saved SSH connection works with key/config authentication or needs interactive password setup.",
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
    name: "remote_browse_dir",
    description: "Browse child directories for a configured SSH host and absolute remote path.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Configured host alias." },
        path: { type: "string", description: "Absolute remote directory path.", default: "/home" },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_select_workspace",
    description: "Save an absolute remote directory as the default workspaceRoot and allowed path for a configured host.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Configured host alias." },
        path: { type: "string", description: "Absolute remote directory path to save as workspace." },
      },
      required: ["host", "path"],
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
    name: "remote_workspace_bootstrap",
    description: "Inspect remote OS, user, shell, workspace path, and common development tools.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        root: { type: "string", description: "Optional absolute remote workspace root." },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_tree",
    description: "Show a bounded remote workspace tree using find.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        root: { type: "string", description: "Optional absolute remote workspace root." },
        path: { type: "string", description: "Relative path inside the workspace root.", default: "." },
        maxDepth: { type: "integer", minimum: 1, maximum: 8, default: 3 },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_search_text",
    description: "Search for text inside a remote workspace. Uses rg when available, with grep fallback.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        root: { type: "string", description: "Optional absolute remote workspace root." },
        path: { type: "string", description: "Relative path inside the workspace root.", default: "." },
        query: { type: "string", description: "Literal text or regex to search for." },
        regex: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
      },
      required: ["host", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_git_status",
    description: "Run git status in a remote workspace.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        root: { type: "string", description: "Optional absolute remote workspace root." },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "remote_replace_in_file",
    description: "Replace exact UTF-8 text in an allowlisted remote file. Requires allowWrites=true.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        root: { type: "string", description: "Optional absolute remote workspace root." },
        path: { type: "string", description: "Absolute path or relative path inside the workspace root." },
        oldText: { type: "string", description: "Exact text to replace." },
        newText: { type: "string", description: "Replacement text." },
        expectedReplacements: { type: "integer", minimum: 1, default: 1 },
      },
      required: ["host", "path", "oldText", "newText"],
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
  if (name === "remote_render_folder_picker") {
    const hosts = loadHostConfig();
    const selectedHost = args.host || Object.keys(hosts)[0] || "";
    const initialPath = args.path || (selectedHost && hosts[selectedHost] && hosts[selectedHost].workspaceRoot) || "/home";
    return widgetResult(
      {
        hosts: Object.fromEntries(
          Object.entries(hosts).map(([alias, config]) => [alias, redactConfig({ alias, ...config })]),
        ),
        selectedHost,
        path: initialPath,
        entries: [],
      },
      FOLDER_PICKER_TEMPLATE_URI,
    );
  }

  if (name === "remote_connection_wizard" || name === "remote_add_host") {
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
    if (!alias) {
      throw new Error("remote_remove_host requires a non-empty name.");
    }
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

  if (name === "remote_connection_auth_check") {
    const result = await runSsh(config, "printf 'connected\\n'; hostname; whoami", name);
    const status = classifySshFailure(result);
    return textResult({
      ok: result.exitCode === 0,
      status,
      host: config.alias,
      passwordFallbackAvailable: status === "password_or_key_required",
      passwordStored: false,
      recommendation:
        status === "password_or_key_required"
          ? "Use an SSH key or ~/.ssh/config for normal Codex operation. Password fallback should be used only during setup and must not be stored in plugin config."
          : undefined,
      result,
    });
  }

  if (name === "remote_test_connection") {
    return textResult(await runSsh(config, "printf 'connected\\n'; hostname; whoami", name));
  }

  if (name === "remote_run") {
    assertCommandAllowed(config, args.command);
    return textResult(await runSsh(config, args.command, name));
  }
  if (name === "remote_browse_dir") {
    const remotePath = assertPathAllowed(config, args.path || "/home", "browse");
    const result = await runSsh(config, buildBrowseDirCommand(remotePath, args.limit), name);
    return textResult({
      host: config.alias,
      path: remotePath,
      ok: result.exitCode === 0,
      status: result.exitCode === 0 ? "ok" : classifySshFailure(result),
      entries: result.exitCode === 0 ? parseRemoteDirectoryEntries(result.stdout, remotePath) : [],
      result,
    });
  }
  if (name === "remote_select_workspace") {
    const remotePath = normalizeRemotePath(args.path);
    const exists = await runSsh(config, `test -d ${shellQuote(remotePath)} && printf 'directory\\n'`, name);
    if (exists.exitCode !== 0) {
      return textResult({
        saved: false,
        host: config.alias,
        path: remotePath,
        status: classifySshFailure(exists),
        result: exists,
      });
    }
    const { file, config: writableConfig } = readWritableConfig();
    const profile = selectWorkspaceInConfig(writableConfig, config.alias, remotePath, config);
    writeWritableConfig(file, writableConfig);
    return textResult({
      saved: true,
      host: config.alias,
      path: remotePath,
      configFile: file,
      profile: redactConfig({ alias: config.alias, ...profile }),
    });
  }
  if (name === "remote_workspace_bootstrap") {
    const root = args.root || config.workspaceRoot || "~";
    const rootTarget = root === "~" ? "~" : shellQuote(root);
    const command = [
      "printf 'user='; whoami",
      "printf 'host='; hostname",
      "printf 'os='; uname -a",
      "printf 'shell='; printf %s \"$SHELL\"; printf '\\n'",
      `printf 'workspace='; cd ${rootTarget} 2>/dev/null && pwd || printf 'unavailable'`,
      "p=$(command -v node 2>/dev/null || true); printf 'node=%s\\n' \"${p:-missing}\"",
      "p=$(command -v npm 2>/dev/null || true); printf 'npm=%s\\n' \"${p:-missing}\"",
      "p=$(command -v git 2>/dev/null || true); printf 'git=%s\\n' \"${p:-missing}\"",
      "p=$(command -v rg 2>/dev/null || true); printf 'rg=%s\\n' \"${p:-missing}\"",
      "p=$(command -v python3 2>/dev/null || true); printf 'python3=%s\\n' \"${p:-missing}\"",
    ].join("; ");
    return textResult(await runSsh(config, command, name));
  }
  if (name === "remote_tree") {
    const target = resolveRemoteWorkspacePath(config, args.root, args.path || ".", "tree");
    const maxDepth = Math.max(1, Math.min(Number(args.maxDepth || 3), 8));
    const limit = Math.max(1, Math.min(Number(args.limit || 200), 1000));
    const command = `find ${shellQuote(target)} -maxdepth ${maxDepth} -mindepth 1 -not -path '*/.git/*' -print | sort | head -n ${limit}`;
    return textResult(await runSsh(config, command, name));
  }
  if (name === "remote_search_text") {
    if (typeof args.query !== "string" || args.query.length === 0) {
      throw new Error("remote_search_text requires a non-empty query string.");
    }
    const target = resolveRemoteWorkspacePath(config, args.root, args.path || ".", "search");
    const limit = Math.max(1, Math.min(Number(args.limit || 200), 1000));
    const rgMode = args.regex ? "" : "-F ";
    const grepMode = args.regex ? "-E" : "-F";
    const quotedQuery = shellQuote(args.query);
    const quotedTarget = shellQuote(target);
    const command = [
      "if command -v rg >/dev/null 2>&1; then",
      `rg --line-number --hidden --glob '!.git' ${rgMode}-e ${quotedQuery} -- ${quotedTarget} | head -n ${limit};`,
      "else",
      `grep -RIn ${grepMode} --exclude-dir=.git -e ${quotedQuery} -- ${quotedTarget} | head -n ${limit};`,
      "fi",
    ].join(" ");
    return textResult(await runSsh(config, command, name));
  }
  if (name === "remote_git_status") {
    const root = resolveRemoteWorkspacePath(config, args.root, ".", "git status");
    return textResult(await runSsh(config, `cd ${shellQuote(root)} && git status --short --branch`, name));
  }
  if (name === "remote_replace_in_file") {
    if (!config.allowWrites) {
      throw new Error(`Writes are disabled for host alias ${config.alias}. Set allowWrites=true to enable.`);
    }
    const remotePath = resolveRemoteWorkspacePath(config, args.root, args.path, "replace");
    const expected = Math.max(1, Number(args.expectedReplacements || 1));
    const script = [
      "import base64, pathlib",
      `p = pathlib.Path(${JSON.stringify(remotePath)})`,
      `old = base64.b64decode(${JSON.stringify(base64Text(args.oldText))}).decode('utf-8')`,
      `new = base64.b64decode(${JSON.stringify(base64Text(args.newText))}).decode('utf-8')`,
      "text = p.read_text(encoding='utf-8')",
      "count = text.count(old)",
      `expected = ${expected}`,
      "if count != expected:",
      "    raise SystemExit(f'expected {expected} replacement(s), found {count}')",
      "p.write_text(text.replace(old, new), encoding='utf-8')",
      "print(f'replaced {count} occurrence(s)')",
    ].join("\n");
    const command = `python3 -c ${shellQuote(script)}`;
    return textResult(await runSsh(config, command, name));
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
    if (typeof args.content !== "string") {
      throw new Error("remote_write_file requires content as a UTF-8 string.");
    }
    const remotePath = assertPathAllowed(config, args.path, "write");
    const encoded = Buffer.from(args.content, "utf8").toString("base64");
    const quotedPath = shellQuote(remotePath);
    const writeCommand = args.overwrite
      ? `printf %s ${shellQuote(encoded)} | base64 -d > ${quotedPath}`
      : `set -C; printf %s ${shellQuote(encoded)} | base64 -d > ${quotedPath}`;
    return textResult(await runSsh(config, writeCommand, name));
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handle(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "remote-ssh", version: SERVER_VERSION },
    };
  }
  if (request.method === "tools/list") {
    return { tools };
  }
  if (request.method === "resources/list") {
    return {
      resources: [
        {
          uri: FOLDER_PICKER_TEMPLATE_URI,
          name: "Remote SSH Folder Picker",
          description: "Visual folder picker for saved Remote SSH hosts.",
          mimeType: "text/html",
        },
      ],
    };
  }
  if (request.method === "resources/read") {
    if (!request.params || request.params.uri !== FOLDER_PICKER_TEMPLATE_URI) {
      throw new Error(`Unknown resource: ${request.params && request.params.uri}`);
    }
    return {
      contents: [
        {
          uri: FOLDER_PICKER_TEMPLATE_URI,
          mimeType: "text/html",
          text: folderPickerHtml,
        },
      ],
    };
  }
  if (request.method === "tools/call") {
    return callTool(request.params.name, request.params.arguments || {});
  }
  if (request.method && request.method.startsWith("notifications/")) {
    return {};
  }
  const err = new Error(`Method not found: ${request.method}`);
  err.code = -32601;
  throw err;
}

function writeResponse(id, result) {
  if (id === undefined || id === null) return;
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function writeError(id, error) {
  if (id === undefined) return;
  const code = Number.isInteger(error && error.code) ? error.code : -32000;
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id === undefined ? null : id,
      error: { code, message: error.message },
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
    } catch (error) {
      const parseError = new Error(`Parse error: ${error.message}`);
      parseError.code = -32700;
      writeError(null, parseError);
      return;
    }
    try {
      const result = await handle(request);
      writeResponse(request.id, result);
    } catch (error) {
      writeError(request.id, error);
    }
  });

  rl.on("close", () => {});
}

if (require.main === module) {
  startServer();
}

module.exports = {
  assertCommandAllowed,
  assertPathAllowed,
  base64Text,
  buildBrowseDirCommand,
  cleanHostProfile,
  defaultConfigFile,
  expandHome,
  handle,
  loadHostConfig,
  normalizeRemotePath,
  parseRemoteDirectoryEntries,
  readWritableConfig,
  redactConfig,
  resolveRemoteWorkspacePath,
  selectWorkspaceInConfig,
  shellQuote,
  startServer,
  tools,
  writeWritableConfig,
};
