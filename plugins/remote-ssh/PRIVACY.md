# Privacy Policy

Codex Remote SSH by Zain Technologies LTD runs locally and sends SSH commands only to host aliases configured by the user.

The plugin does not require users to paste private keys into Codex. SSH authentication material remains in the user's local SSH setup, key files, ssh-agent, or `~/.ssh/config`.

Remote command output, directory listings, and file contents returned by MCP tools may be visible to Codex in the active conversation. Optional audit logs are written locally only when `REMOTE_SSH_AUDIT_LOG` is configured.

The plugin does not operate a hosted service and does not intentionally transmit data to Zain Technologies LTD. Users remain responsible for configuring appropriate host aliases, least-privilege SSH accounts, and safe remote path policies.
