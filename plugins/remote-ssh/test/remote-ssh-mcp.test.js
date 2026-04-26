"use strict";

const assert = require("node:assert/strict");
const {
  assertCommandAllowed,
  assertPathAllowed,
  handle,
  normalizeRemotePath,
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

assert.doesNotThrow(() => assertCommandAllowed(config, "systemctl status app"));
assert.throws(() => assertCommandAllowed(config, "cat /etc/passwd"), /allowlist/);
assert.throws(() => assertCommandAllowed({ ...config, allowedCommands: [] }, "rm -rf /srv/app"), /policy/);

assert.ok(tools.some((tool) => tool.name === "remote_hosts"));
assert.ok(tools.some((tool) => tool.name === "remote_tail_file"));

handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }).then((response) => {
  assert.ok(response.tools.length >= 7);
  console.log("remote-ssh-mcp tests passed");
});
