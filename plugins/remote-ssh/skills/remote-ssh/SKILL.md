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
   - optional allowed remote paths
   Then use `remote_add_host` and test with `remote_test_connection`.
3. Prefer narrow tools over broad shell access:
   - use `remote_list_dir` before reading unknown paths
   - use `remote_read_file` for file inspection
   - use `remote_write_file` only when the user clearly wants a remote edit
   - use `remote_run` for tests, service status, logs, and other explicit commands
4. Keep remote commands non-interactive.
5. Do not request or echo private key material. Only ask for the identity file path.
6. Summarize remote command output clearly when the user cannot see the tool output.

## Safety

Ask for confirmation before destructive remote operations such as deleting files, overwriting configuration, restarting production services, or running migrations.

If authentication fails, guide the user to verify SSH access locally first:

```powershell
ssh -i $HOME\.ssh\id_ed25519_hms user@host "hostname"
```
