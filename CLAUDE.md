# aiupdate

Updates all AI agent CLIs and skills concurrently.

## Commands

```bash
pnpm run build   # compile src/cli.ts → dist/cli.js
pnpm run dev     # run without building (tsx)
aiupdate             # update all tools + skills
aiupdate claude      # target a single tool (skills skipped)
aiupdate claude codex  # target multiple tools (skills skipped)
aiupdate skills      # update skills only
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
- `dist/cli.js` — compiled output, referenced by `bin.aiupdate` in package.json

## Versioning

`getVersion` extracts the first `/\d+\.\d+\.\d+/` match from `<tool> --version` stdout. If the output format doesn't match, set `versioned: false`.
