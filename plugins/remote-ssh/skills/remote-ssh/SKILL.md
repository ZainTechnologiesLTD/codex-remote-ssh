---
name: remote-ssh
description: Use configured SSH hosts from Codex for remote development tasks such as running commands, reading files, listing directories, writing files, checking logs, and validating deployments.
---

# Remote SSH

Use this skill when the user asks Codex to inspect or operate a configured remote machine over SSH.

## Workflow

1. Confirm the target host alias, remote path, and command intent from the user's request.
2. When the user wants to add a connection, collect:
   - friendly name
   - SSH host as `user@hostname` or a `~/.ssh/config` host
   - optional port
   - optional identity file
   - optional workspace root
   - optional allowed remote paths
   Then use `remote_connection_wizard` and test with `remote_test_connection`.
   Use `remote_add_host` only when the user asks for advanced policy fields such as workspace root, allowed paths, or write access.
3. When the user wants to choose a project folder visually or avoid typing SSH commands repeatedly:
   - use `remote_render_folder_picker` when the host can render Apps-compatible plugin UI
   - use `remote_browse_dir` conversationally when UI rendering is unavailable
   - use `remote_select_workspace` after the user chooses a folder
   - then use the saved host alias and workspace tools instead of raw SSH commands
4. When the user wants to work in a remote project, prefer workspace tools:
   - use `remote_workspace_bootstrap` to check environment readiness
   - use `remote_tree` to inspect project structure
   - use `remote_search_text` to locate code
   - use `remote_git_status` before and after edits
   - use `remote_replace_in_file` for narrow exact edits when writes are enabled
5. Prefer narrow tools over broad shell access:
   - use `remote_list_dir` before reading unknown paths
   - use `remote_read_file` for file inspection
   - use `remote_write_file` only when the user clearly wants a remote edit
   - use `remote_run` for tests, service status, logs, and other explicit commands
6. Keep remote commands non-interactive.
7. Do not request or echo private key material or plaintext passwords. Only ask for the identity file path.
8. Summarize remote command output clearly when the user cannot see the tool output.

## Safety

Ask for confirmation before destructive remote operations such as deleting files, overwriting configuration, restarting production services, or running migrations.

If authentication fails, use `remote_connection_auth_check` to classify the problem. Prefer SSH keys or `~/.ssh/config`. Do not store plaintext passwords in the plugin config.

Guide the user to verify SSH access locally first:

```powershell
ssh -i $HOME\.ssh\id_ed25519_hms user@host "hostname"
```
