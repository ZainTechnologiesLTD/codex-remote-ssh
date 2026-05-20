# Changelog

## 0.6.2

- Fix compatibility issues with macOS target hosts (`find` and `base64` commands).
- Avoid Python's CRLF to LF conversions when updating files on Windows.
- Ensure the plugin CLI port validation handles integer boundaries correctly.
- Add configuration safety checks to prevent crashes when config file is unreadable.
- See [plugins/remote-ssh/CHANGELOG.md](./plugins/remote-ssh/CHANGELOG.md) for the per-tool detail.

## 0.6.1

- Patch release rolling up the bug fixes and robustness improvements from #1 (`remote_browse_dir` schema, `remote_select_workspace` env-host persistence, `remote_write_file` no-clobber, audit log resilience, JSON-RPC `-32601`/`-32700` error codes, `remote_search_text` query hardening, input validation for `remote_remove_host`/`blockedCommandPatterns`).
- See [plugins/remote-ssh/CHANGELOG.md](./plugins/remote-ssh/CHANGELOG.md) for the per-tool detail.

## 0.6.0

- Added an Apps-compatible visual folder picker resource for saved SSH hosts.
- Added `remote_render_folder_picker`, `remote_browse_dir`, and `remote_select_workspace`.
- Added `remote_connection_auth_check` to detect whether key/config authentication works or password setup is needed.
- Workspace selection now saves `workspaceRoot` and adds the selected directory to `allowedPaths`.

## 0.5.0

- Added `remote_connection_wizard`, a simple user-facing Add SSH Connection tool with only Name, SSH Host, SSH Port, and Identity File fields.
- Added `codex-remote-ssh add` CLI fallback for users who need a terminal-based setup flow.
- Added `codex-remote-ssh list` for inspecting saved connection profiles without secrets.

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
