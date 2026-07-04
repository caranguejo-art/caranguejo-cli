# @caranguejo/cli

Command-line client for the [Caranguejo Developer API](https://docs.caranguejo.art).

## Install

```bash
npm install -g @caranguejo/cli
# or
curl -fsSL https://caranguejo.art/install.sh | sh
```

## Quickstart

```bash
caranguejo auth login          # paste your ck_live_… key (Account → Apps & API)
caranguejo generate image --prompt "a red crab on a neon beach, cinematic" \
  --quality high --resolution 2K --size 3:2 --wait
```

The last command prints the finished image URL to stdout.

## Commands

| Command | Description |
|---|---|
| `auth login \| status \| logout` | Manage your stored API key (`~/.caranguejo/config.json`) |
| `generate image --prompt <t> [flags] [--wait]` | Create an image (`--image` repeatable for edits/references) |
| `upload <file>` | Host a file, print its permanent URL |
| `models list \| get <slug>` | Model capabilities |
| `generations list \| get <id>` | Your API generations |
| `balance` | Credit balance |

Global flags: `--json` (machine-readable), `--no-color`, `--base-url <url>`.

Auth resolves `CARANGUEJO_API_KEY` before the stored key, so CI can export it.

Full docs: **https://docs.caranguejo.art**
