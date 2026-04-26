"use strict";

const assert = require("node:assert/strict");
const {
  assertCommandAllowed,
  assertPathAllowed,
  base64Text,
  cleanHostProfile,
  defaultConfigFile,
  handle,
  normalizeRemotePath,
  resolveRemoteWorkspacePath,
  tools,
} = require("../scripts/remote-ssh-mcp.js");

assert.equal(normalizeRemotePath("/var/log/../log/app.log"), "/var/log/app.log");
assert.throws(() => normalizeRemotePath("relative/path"), /absolute/);

const config = {
  alias: "prod",
  allowedPaths: ["/srv/app", "/var/log/app"],
  allowCommandExecution: true,
  allowedCommands: ["ls", "tail", "systemctl status"],
  blockedCommandPatterns: ["\\brm\\s+-rf\\b"],
};

assert.equal(assertPathAllowed(config, "/srv/app/current/package.json", "read"), "/srv/app/current/package.json");
assert.throws(() => assertPathAllowed(config, "/etc/passwd", "read"), /path policy/);
assert.equal(resolveRemoteWorkspacePath(config, "/srv/app", "current/package.json", "read"), "/srv/app/current/package.json");
assert.throws(() => resolveRemoteWorkspacePath(config, "/srv/app", "../secrets", "read"), /escapes workspace root/);

assert.doesNotThrow(() => assertCommandAllowed(config, "systemctl status app"));
assert.throws(() => assertCommandAllowed(config, "cat /etc/passwd"), /allowlist/);
assert.throws(() => assertCommandAllowed({ ...config, allowedCommands: [] }, "rm -rf /srv/app"), /policy/);

assert.ok(tools.some((tool) => tool.name === "remote_hosts"));
assert.ok(tools.some((tool) => tool.name === "remote_connection_wizard"));
assert.ok(tools.some((tool) => tool.name === "remote_add_host"));
assert.ok(tools.some((tool) => tool.name === "remote_remove_host"));
assert.ok(tools.some((tool) => tool.name === "remote_test_connection"));
assert.ok(tools.some((tool) => tool.name === "remote_workspace_bootstrap"));
assert.ok(tools.some((tool) => tool.name === "remote_tree"));
assert.ok(tools.some((tool) => tool.name === "remote_search_text"));
assert.ok(tools.some((tool) => tool.name === "remote_git_status"));
assert.ok(tools.some((tool) => tool.name === "remote_replace_in_file"));
assert.ok(tools.some((tool) => tool.name === "remote_tail_file"));

assert.match(defaultConfigFile(), /remote-ssh-hosts\.json$/);

assert.deepEqual(
  cleanHostProfile({
    sshHost: "alice@example.com",
    identityFile: "~/.ssh/id_ed25519",
    workspaceRoot: "/home/alice/project",
    allowedPaths: ["/home/alice"],
  }),
  {
    user: "alice",
    host: "example.com",
    port: 22,
    identityFile: "~/.ssh/id_ed25519",
    workspaceRoot: "/home/alice/project",
    allowedPaths: ["/home/alice"],
    allowWrites: false,
    strictHostKeyChecking: true,
    connectTimeoutSeconds: 15,
    commandTimeoutMs: 120000,
    maxOutputBytes: 1048576,
  },
);

assert.deepEqual(
  cleanHostProfile({
    sshHost: "prod-from-ssh-config",
  }),
  {
    sshConfigHost: "prod-from-ssh-config",
    port: 22,
    allowedPaths: [],
    allowWrites: false,
    strictHostKeyChecking: true,
    connectTimeoutSeconds: 15,
    commandTimeoutMs: 120000,
    maxOutputBytes: 1048576,
  },
);

assert.equal(base64Text("hello"), "aGVsbG8=");

handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }).then((response) => {
  assert.ok(response.tools.length >= 16);
  console.log("remote-ssh-mcp tests passed");
});
