# Codex Remote SSH

Enterprise-grade Remote SSH tools for OpenAI Codex, built by [Zain Technologies LTD](https://zaintechnologiesltd.github.io/).

Codex Remote SSH connects Codex to trusted servers, devboxes, and private infrastructure through a local MCP bridge. It is designed for professional engineering and operations workflows where security, auditability, and least-privilege access matter.

## Platform Support

Codex Remote SSH supports cross-platform desktop use on:

- Windows
- macOS
- Linux

The plugin requires a local Codex plugin/MCP runtime, Node.js, filesystem access, and the system `ssh` client. Mobile platforms such as iOS and Android are not currently supported unless Codex provides a compatible local MCP runtime there.

## Why This Exists

Modern teams often keep source code, logs, services, and deployment tools on remote Linux hosts or private networks. Codex can already run local shell commands, but a marketplace-grade remote plugin should provide safer primitives than raw SSH strings.

This plugin exposes clear tools for common remote work:

- add and save SSH connections conversationally
- inspect whether a remote host is ready for development
- browse bounded remote workspace trees
- search text inside remote workspaces
- check remote Git status
- discover configured host aliases
- run non-interactive remote commands
- list directories
- inspect file metadata
- read text files
- tail logs
- write files only when the host explicitly allows writes

## Enterprise Controls

- Host aliases prevent arbitrary target selection.
- Path allowlists restrict file tools to approved directories.
- Remote writes are disabled by default.
- Dangerous command patterns are blocked by default.
- Command timeouts and output limits protect local Codex sessions.
- Optional JSONL audit logs capture tool, host alias, exit code, and duration.
- SSH credentials stay in the local SSH stack; private keys are never pasted into Codex.

## Installation

When published to GitHub:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh/plugins/remote-ssh --plugin --global
```

If the repository keeps the included `.agents/plugins/marketplace.json` catalog, users can install all plugins from the repo with:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh --plugins --global
```

Global installation is recommended so Remote SSH appears across Codex projects after restart. For local development or one-project installs, use `--project` instead of `--global`.

## Troubleshooting Visibility

After installing globally, restart Codex. If Remote SSH is enabled but still not visible, confirm that `~/.codex/config.toml` includes both entries:

```toml
[plugins."remote-ssh@codex-marketplace-global"]
enabled = true

[marketplaces.codex-marketplace-global]
source_type = "local"
source = '\\?\C:\Users\<you>'
```

Also confirm the global marketplace and plugin paths exist:

```text
~/.agents/plugins/marketplace.json
~/.codex/plugins/remote-ssh
```

## Configuration

Most users should add connections conversationally:

```text
Add an SSH connection named hms for hmsadmin@192.168.128.7 using identity file ~/.ssh/id_ed25519_hms.
```

If Codex renders the tool as a form, the normal setup only needs:

```text
Name
SSH Host
SSH Port
Identity File (Private Key)
```

If the plugin UI is unavailable, use the terminal fallback:

```bash
codex-remote-ssh add
```

The plugin saves profiles to:

```text
~/.codex/remote-ssh-hosts.json
```

Advanced users can still configure hosts through `REMOTE_SSH_HOSTS` or `REMOTE_SSH_CONFIG_FILE`.

PowerShell example:

```powershell
$env:REMOTE_SSH_HOSTS='{
  "hms": {
    "user": "hmsadmin",
    "host": "192.168.128.7",
    "identityFile": "C:\\Users\\mhbab\\.ssh\\id_ed25519_hms",
    "allowedPaths": ["/home/hmsadmin", "/var/log"],
    "allowWrites": false,
    "commandTimeoutMs": 120000,
    "strictHostKeyChecking": true
  }
}'
```

File-based configuration:

```powershell
$env:REMOTE_SSH_CONFIG_FILE="$HOME\.codex\remote-ssh-hosts.json"
```

See [CONFIGURATION.md](./CONFIGURATION.md) for the full schema.

## Example Prompts

```text
Use Remote SSH to list configured hosts.
```

```text
Use Remote SSH to run uptime on hms.
```

```text
Use Remote SSH to tail the last 100 lines of /var/log/nginx/error.log on hms.
```

## Tool Surface

| Tool | Purpose |
| --- | --- |
| `remote_connection_wizard` | Adds a connection with the simple Name, SSH Host, SSH Port, Identity File form. |
| `remote_add_host` | Saves or updates an SSH connection profile. |
| `remote_remove_host` | Removes a saved SSH connection profile. |
| `remote_test_connection` | Validates a saved SSH connection. |
| `remote_hosts` | Lists configured host aliases and non-secret policy metadata. |
| `remote_run` | Runs a non-interactive command on a configured host. |
| `remote_workspace_bootstrap` | Checks remote OS, user, shell, workspace path, and dev tools. |
| `remote_tree` | Shows a bounded remote workspace tree. |
| `remote_search_text` | Searches text inside a remote workspace. |
| `remote_git_status` | Runs Git status in a remote workspace. |
| `remote_list_dir` | Lists an allowlisted directory. |
| `remote_stat` | Returns metadata for an allowlisted path. |
| `remote_read_file` | Reads an allowlisted UTF-8 text file. |
| `remote_tail_file` | Reads the last lines of an allowlisted text/log file. |
| `remote_replace_in_file` | Replaces exact text in an allowlisted writable file. |
| `remote_write_file` | Writes UTF-8 text when `allowWrites=true`. |

## Security

Read [SECURITY.md](./SECURITY.md) before enabling this plugin for production infrastructure.

The default posture is intentionally conservative. Remote writes are opt-in, host aliases are required, and private keys remain outside the plugin.

## Sponsorship

Maintenance sponsorship helps fund Codex compatibility updates, security hardening, cross-platform testing, documentation, and enterprise support for Remote SSH.

- GitHub Sponsors: https://github.com/sponsors/ZainTechnologiesLTD
- Company sponsorship: https://zaintechnologiesltd.github.io/
- OpenCollective: planned, pending account setup

See the repository [SPONSORS.md](../../SPONSORS.md) for sponsorship options and governance.

## Development

```bash
npm test
```

The MCP server has no runtime npm dependencies. It uses the system `ssh` binary.

## Publisher

Zain Technologies LTD builds AI-powered products, secure infrastructure, DevOps automation, cybersecurity capabilities, and enterprise digital platforms for mission-critical industries.
