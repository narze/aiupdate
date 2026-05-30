# aiupdate

Update all your AI agent CLIs and skills concurrently.

## Usage

```bash
npx aiupdate                        # update everything (tools + skills)
npx aiupdate claude                 # update one tool (skills skipped)
npx aiupdate claude codex opencode  # update specific tools (skills skipped)
npx aiupdate skills                 # update skills only
npx aiupdate claude skills          # update one tool + skills
```

Or install globally:

```bash
npm install -g aiupdate
```

Each tool runs concurrently. After updating, aiupdate shows the version change (or "up to date") for each tool.

## What it updates

| Tool | Update command |
|------|---------------|
| [Claude Code](https://claude.ai/code) | `claude update` |
| [OpenAI Codex](https://github.com/openai/codex) | `codex update` |
| [OpenCode](https://opencode.ai) | `opencode upgrade` |
| [Cursor Agent](https://cursor.com) | `cursor-agent update` |
| [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli) | `copilot update` |
| [skills](https://github.com/anthropics/skills) | `npx skills update -g -p -y` |

Tools not installed on your machine are silently skipped.

## Contributing

To add a new tool, use the `/add-agent` skill in Claude Code — it walks through verification, adds the entry to `AI_TOOLS`, builds, and commits.

If adding manually, open `src/cli.ts` and append one line to `AI_TOOLS`:

```typescript
{ name: 'mytool', command: 'mytool', args: ['update'], versioned: true },
```

Then build and test:

```bash
pnpm run build
aiupdate mytool
```
