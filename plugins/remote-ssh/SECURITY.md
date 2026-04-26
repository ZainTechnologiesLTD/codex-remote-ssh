# Security Policy

Codex Remote SSH is designed for authorized remote administration and development workflows. Treat any remote host exposed to Codex as a sensitive system.

## Recommended Production Posture

- Use dedicated SSH users with least-privilege permissions.
- Prefer read-only host aliases for production.
- Keep `allowWrites=false` unless a specific host and path require write access.
- Set `allowedPaths` for every host.
- Use `allowedCommands` for production or regulated environments.
- Keep `strictHostKeyChecking=true`.
- Store private keys outside the plugin and protect them with OS-level permissions.
- Enable `REMOTE_SSH_AUDIT_LOG` for operational traceability.
- Review Codex prompts before running commands against production systems.

## Credential Handling

The plugin never asks users to paste private keys, passwords, or passphrases into chat. It calls the system `ssh` binary and relies on normal SSH key files, ssh-agent, and `~/.ssh/config` behavior.

## Destructive Operations

The MCP server blocks a default set of high-risk command patterns such as recursive root deletion, shutdown, reboot, firewall disabling, account deletion, and broad permission changes. This is a safety layer, not a substitute for least-privilege SSH accounts.

## Reporting Issues

Report security issues privately to:

```text
hello@zain-technologies.com
```

Do not disclose exploitable security issues publicly until maintainers have had a chance to investigate and release a fix.

