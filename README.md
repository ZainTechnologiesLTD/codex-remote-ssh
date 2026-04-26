# Codex Remote SSH Plugin Repository

This repository contains the Codex Remote SSH plugin by [Zain Technologies LTD](https://zaintechnologiesltd.github.io/).

Codex Remote SSH is an enterprise-grade Remote SSH plugin for OpenAI Codex. It connects Codex to trusted servers, devboxes, and private infrastructure through a local MCP bridge with host aliases, path policies, write controls, timeouts, output limits, and optional audit logging.

Plugin path:

```text
plugins/remote-ssh
```

Install the plugin directly:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh/plugins/remote-ssh --plugin
```

Or install from the repository catalog:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh --plugins
```

See [plugins/remote-ssh/README.md](./plugins/remote-ssh/README.md) for setup, security, and development details.

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
