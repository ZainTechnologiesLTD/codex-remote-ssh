# Changelog

## 0.3.0

- Added conversational SSH connection management with `remote_add_host`.
- Added `remote_remove_host` for deleting saved connection profiles.
- Added `remote_test_connection` for validating saved profiles.
- Added default config discovery at `~/.codex/remote-ssh-hosts.json`.
- Reduced setup friction so users no longer need environment variables for normal use.

## 0.2.0

- Added Zain Technologies LTD marketplace metadata.
- Added host policy controls, audit logging, timeouts, and output limits.
- Added `remote_hosts`, `remote_stat`, and `remote_tail_file`.
- Made remote writes opt-in with `allowWrites`.
- Added configuration, architecture, security, and publishing documentation.

## 0.1.0

- Initial plugin scaffold.
- Added basic MCP tools for commands, file reads, directory listing, and file writes.
