# Codex Remote SSH Plugin Repository

This repository contains the Codex Remote SSH plugin by [Zain Technologies LTD](https://zaintechnologiesltd.github.io/).

Codex Remote SSH is an enterprise-grade Remote SSH plugin for OpenAI Codex. It connects Codex to trusted servers, devboxes, and private infrastructure through a local MCP bridge with host aliases, path policies, write controls, timeouts, output limits, and optional audit logging.

Plugin path:

```text
plugins/remote-ssh
```

Install the plugin directly:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh/plugins/remote-ssh --plugin --global
```

Global installation is recommended so the plugin appears across Codex projects after restart. For a single project, use `--project` instead of `--global`.

Or install from the repository catalog:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh --plugins --global
```

See [plugins/remote-ssh/README.md](./plugins/remote-ssh/README.md) for setup, security, and development details.

## Sponsorship

Codex Remote SSH accepts maintenance sponsorship for ongoing security hardening, Codex compatibility updates, cross-platform testing, documentation, and enterprise support.

- GitHub Sponsors: https://github.com/sponsors/ZainTechnologiesLTD
- Company sponsorship: https://zaintechnologiesltd.github.io/
- OpenCollective: planned, pending account setup

See [SPONSORS.md](./SPONSORS.md) for sponsorship options and governance.

## Platform Support

Codex Remote SSH supports cross-platform desktop use on:

- Windows
- macOS
- Linux

The plugin requires a local Codex plugin/MCP runtime, Node.js, filesystem access, and the system `ssh` client. Mobile platforms such as iOS and Android are not currently supported unless Codex provides a compatible local MCP runtime there.

## Troubleshooting Visibility

After global install, restart Codex. If Remote SSH still does not appear in the plugin UI, confirm that `~/.codex/config.toml` includes both the plugin entry and the marketplace source:

```toml
[plugins."remote-ssh@codex-marketplace-global"]
enabled = true

[marketplaces.codex-marketplace-global]
source_type = "local"
source = '\\?\C:\Users\<you>'
```

The global marketplace manifest should exist at:

```text
~/.agents/plugins/marketplace.json
```

The installed plugin should exist at:

```text
~/.codex/plugins/remote-ssh
```

## Repository Documents

- [License](./LICENSE)
- [Security Policy](./SECURITY.md)
- [Privacy Policy](./PRIVACY.md)
- [Terms](./TERMS.md)
- [Changelog](./CHANGELOG.md)
- [Architecture](./plugins/remote-ssh/ARCHITECTURE.md)
- [Configuration](./plugins/remote-ssh/CONFIGURATION.md)

## GitHub Package

The npm package is published to GitHub Packages as:

```text
@zaintechnologiesltd/codex-remote-ssh
```

The package publishing workflow lives at:

```text
.github/workflows/publish-package.yml
```

## Key Features

- Local MCP server with no runtime npm dependencies
- SSH host aliases instead of arbitrary target selection
- Path allowlists for file tools
- Remote writes disabled by default
- Default blocked patterns for high-risk commands
- Non-interactive command execution with timeouts
- Optional JSONL audit logging
- Marketplace-ready plugin manifest and catalog entry
