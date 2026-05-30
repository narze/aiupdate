# aiup

Updates all AI agent CLIs and skills concurrently.

## Commands

```bash
pnpm run build   # compile src/cli.ts → dist/cli.js
pnpm run dev     # run without building (tsx)
aiup             # update all tools + skills
aiup claude      # target a single tool (skills skipped)
aiup claude codex  # target multiple tools (skills skipped)
aiup skills      # update skills only
```

## Adding a new tool

Use the `/add-agent` skill — see `.claude/skills/add-agent/skill.md` for the full checklist.

## Current tools

| name | command | update args |
|------|---------|-------------|
| claude | `claude` | `update` |
| codex | `codex` | `update` |
| opencode | `opencode` | `upgrade` |
| cursor-agent | `cursor-agent` | `update` |
| copilot | `copilot` | `update` |

## Key files

- `src/cli.ts` — entire implementation (single file)
- `dist/cli.js` — compiled output, referenced by `bin.aiup` in package.json

## Versioning

`getVersion` extracts the first `/\d+\.\d+\.\d+/` match from `<tool> --version` stdout. If the output format doesn't match, set `versioned: false`.
