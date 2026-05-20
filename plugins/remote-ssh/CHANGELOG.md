# Changelog

## 0.6.2

- Fixed macOS compatibility in `remote_browse_dir` by using portable `stat -f` when GNU `find -printf` is unsupported.
- Fixed macOS compatibility in `remote_write_file` base64 decoding by providing a portable `decode_base64` shell function using fallback tools (e.g. `base64 -d`, `base64 -D`, `openssl`).
- Prevented CRLF to LF conversion when replacing file content on Windows hosts by reading bytes instead of text.
- Added host configurations validation and try-catch safety wrapper around configuration file reading.
- Hardened the `codex-remote-ssh` CLI port verification so it handles input port ranges correctly.

## 0.6.1

- Fixed `remote_browse_dir` input schema: `path` is no longer marked as required so the documented `/home` default is actually reachable.
- Fixed `remote_select_workspace` failing for hosts loaded from `REMOTE_SSH_HOSTS` or other non-file sources; the writable config is now seeded from the resolved host profile.
- Hardened `remote_write_file`: dropped the dead `operator` ternary in favor of POSIX noclobber (`set -C`) for atomic no-overwrite semantics, and rejected non-string `content` with a clear error.
- Hardened `remote_search_text`: empty queries are rejected up front, and the pattern is now passed via `-e` plus a `--` separator so queries beginning with `-` are no longer interpreted as `rg`/`grep` flags.
- Made `audit()` resilient: the audit log's parent directory is created on demand and append failures are surfaced to stderr instead of crashing the active SSH tool call.
- JSON-RPC layer now returns proper error codes: unknown methods produce `-32601 Method not found` instead of a misleading empty success, JSON parse failures emit `-32700` with `id: null`, and handler-attached `error.code` values are honored.
- Rejected blank `name` in `remote_remove_host` and ignored malformed user-supplied `blockedCommandPatterns` regexes so they no longer crash command validation.
- Extended the test suite to cover the new behaviors (env-host workspace seeding, browse-dir schema, JSON-RPC error code).

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
- Added configuration, architecture, security, and publishing documentation.

## 0.1.0

- Initial plugin scaffold.
- Added basic MCP tools for commands, file reads, directory listing, and file writes.
