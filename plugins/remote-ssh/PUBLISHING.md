# Publishing Checklist

Use this checklist before submitting Remote SSH to a Codex plugin marketplace.

## Required polish

- Confirm repository URL: `https://github.com/ZainTechnologiesLTD/codex-remote-ssh`.
- Confirm company website: `https://zaintechnologiesltd.github.io/`.
- Review `PRIVACY.md` and `TERMS.md` with final legal policy language.
- Add screenshots under `./assets/` if the marketplace requires visual previews.
- Decide whether `remote_write_file` should remain enabled with `allowWrites=true` or move behind a stricter confirmation model.
- Run `npm test`.

## Security review

- Use dedicated SSH users for demo and production screenshots.
- Document production read-only mode.
- Validate path allowlists and command allowlists.
- Document first-time host key verification.
- Do not store private keys, passwords, or passphrases in plugin config.

## Marketplace metadata

The local marketplace entry lives at:

```text
.agents/plugins/marketplace.json
```

The plugin manifest lives at:

```text
plugins/remote-ssh/.codex-plugin/plugin.json
```

Install command format once published from GitHub:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh/plugins/remote-ssh --plugin
```

Catalog install command:

```bash
npx codex-marketplace add ZainTechnologiesLTD/codex-remote-ssh --plugins
```

## GitHub Packages

The package name is:

```text
@zaintechnologiesltd/codex-remote-ssh
```

Publishing is handled by:

```text
.github/workflows/publish-package.yml
```

Run the workflow manually from GitHub Actions or publish a GitHub release. The workflow uses the repository `GITHUB_TOKEN` with `packages: write`.
