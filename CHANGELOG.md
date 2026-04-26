# Changelog

## 0.4.0

- Added remote workspace bootstrap checks for OS, shell, user, workspace path, and common development tools.
- Added remote workspace tree, text search, and git status tools.
- Added exact-text replacement for allowlisted writable files.
- Added optional `workspaceRoot` to saved SSH connection profiles.

## 0.3.1

- Fixed stdio lifecycle handling so async SSH tool calls return results reliably when stdin closes.

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
- Added configuration, architecture, security, privacy, terms, license, and publishing documentation.

## 0.1.0

- Initial plugin scaffold.
- Added basic MCP tools for commands, file reads, directory listing, and file writes.
