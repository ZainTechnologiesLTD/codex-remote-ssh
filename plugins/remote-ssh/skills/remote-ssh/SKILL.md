---
name: remote-ssh
description: Use configured SSH hosts from Codex for remote development tasks such as running commands, reading files, listing directories, writing files, checking logs, and validating deployments.
---

# Remote SSH

Use this skill when the user asks Codex to inspect or operate a configured remote machine over SSH.

## Workflow

1. Confirm the target host alias, remote path, and command intent from the user's request.
2. Prefer narrow tools over broad shell access:
   - use `remote_list_dir` before reading unknown paths
   - use `remote_read_file` for file inspection
   - use `remote_write_file` only when the user clearly wants a remote edit
   - use `remote_run` for tests, service status, logs, and other explicit commands
3. Keep remote commands non-interactive.
4. Do not request or echo private key material.
5. Summarize remote command output clearly when the user cannot see the tool output.

## Safety

Ask for confirmation before destructive remote operations such as deleting files, overwriting configuration, restarting production services, or running migrations.

If authentication fails, guide the user to verify SSH access locally first:

```powershell
ssh -i $HOME\.ssh\id_ed25519_hms user@host "hostname"
```

