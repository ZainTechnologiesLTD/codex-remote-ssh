# Configuration Reference

Codex Remote SSH can save connection profiles automatically. Most users should ask Codex to add a connection instead of editing JSON by hand.

```text
Add an SSH connection named my-server for user@hostname on port 22 using identity file ~/.ssh/id_rsa.
```

Saved profiles are stored at:

```text
~/.codex/remote-ssh-hosts.json
```

Advanced users can override this with `REMOTE_SSH_CONFIG_FILE` or provide ephemeral configuration with `REMOTE_SSH_HOSTS`.

## Automatic Connection Setup

`remote_add_host` accepts the same fields users expect from a modern Remote SSH form:

| Form Field | Tool Field | Notes |
| --- | --- | --- |
| Name | `name` | Friendly alias such as `my-server`. |
| SSH Host | `sshHost` | `user@hostname` or a host from `~/.ssh/config`. |
| SSH Port | `port` | Defaults to `22`. |
| Identity File | `identityFile` | Optional. Leave empty to use default SSH behavior. |
| Allowed Paths | `allowedPaths` | Optional safety policy for file tools. |
| Allow Writes | `allowWrites` | Defaults to `false`. |

## `REMOTE_SSH_HOSTS`

Set this environment variable to a JSON object keyed by host alias.

```json
{
  "production-readonly": {
    "user": "deploy",
    "host": "10.0.10.20",
    "port": 22,
    "identityFile": "~/.ssh/id_ed25519_prod",
    "allowedPaths": ["/srv/app", "/var/log/app"],
    "allowWrites": false,
    "allowCommandExecution": true,
    "allowedCommands": ["pwd", "ls", "cat", "tail", "systemctl status"],
    "strictHostKeyChecking": true,
    "knownHostsFile": "~/.ssh/known_hosts",
    "connectTimeoutSeconds": 15,
    "commandTimeoutMs": 120000,
    "maxOutputBytes": 1048576
  }
}
```

## `REMOTE_SSH_CONFIG_FILE`

Set this environment variable to a JSON file path. The file can contain the host map directly or under a `hosts` key.

```json
{
  "hosts": {
    "devbox": {
      "sshConfigHost": "devbox",
      "allowedPaths": ["/home/dev/project"],
      "allowWrites": true
    }
  }
}
```

`sshConfigHost` lets users reuse `~/.ssh/config` entries.

## Host Fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `host` | string | required unless `sshConfigHost` | Hostname or IP address. |
| `user` | string | required unless `sshConfigHost` | SSH username. |
| `sshConfigHost` | string | optional | Existing host alias from `~/.ssh/config`. |
| `port` | number | `22` | SSH port. |
| `identityFile` | string | optional | Private key path. Supports `~`. |
| `knownHostsFile` | string | optional | Custom known hosts file. |
| `proxyJump` | string | optional | SSH jump host value passed through `-J`. |
| `strictHostKeyChecking` | boolean | `true` | Keep host key verification enabled by default. |
| `allowedPaths` | string[] | `[]` | Empty means file tools can target any absolute path. Non-empty restricts file tools to these prefixes. |
| `allowWrites` | boolean | `false` | Enables `remote_write_file`. |
| `allowCommandExecution` | boolean | `true` | Enables or disables `remote_run`. |
| `allowedCommands` | string[] | `[]` | Optional command prefix allowlist for `remote_run`. |
| `blockedCommandPatterns` | string[] | built-in denylist | Regex patterns blocked for `remote_run`. |
| `connectTimeoutSeconds` | number | `15` | SSH connection timeout. |
| `commandTimeoutMs` | number | `120000` | Remote command timeout. |
| `maxOutputBytes` | number | `1048576` | Max captured stdout and stderr bytes each. |

## Audit Logging

Set `REMOTE_SSH_AUDIT_LOG` to a local JSONL path:

```powershell
$env:REMOTE_SSH_AUDIT_LOG="$HOME\.codex\remote-ssh-audit.jsonl"
```

Each record includes timestamp, tool name, host alias, command phase, exit code, timeout status, and duration.
