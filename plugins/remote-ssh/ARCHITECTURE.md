# Architecture

Codex Remote SSH uses a small local MCP server to translate Codex tool calls into constrained SSH operations.

```text
Codex
  -> Remote SSH plugin metadata
  -> Local MCP server: scripts/remote-ssh-mcp.js
  -> System ssh binary
  -> Configured remote host alias
```

## Design Principles

- Prefer explicit tools over raw terminal access.
- Keep secrets out of prompts and plugin manifests.
- Make host exposure intentional through aliases.
- Make remote writes opt-in.
- Capture audit events without storing file contents.
- Avoid npm runtime dependencies to reduce supply-chain risk.

## MCP Server

The server communicates over stdin/stdout using JSON-RPC messages. It currently implements:

- `initialize`
- `tools/list`
- `tools/call`
- `notifications/initialized`

The server is intentionally stateless. Host configuration is read from environment variables or a config file.

## SSH Execution

Commands are executed with:

```text
ssh -o BatchMode=yes -o ConnectTimeout=<seconds> <target> <command>
```

The plugin expects non-interactive SSH auth. Users should verify host keys and key access outside Codex before relying on the plugin.

