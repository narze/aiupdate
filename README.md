# aiupdate

Update all your AI agent CLIs and skills concurrently.

https://github.com/user-attachments/assets/f4bdd8cb-9c70-4858-a6d1-8ca07d0eadb2

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
| [pi](https://pi.dev/) | `pi update pi` |
| [Antigravity](https://github.com/google-antigravity/antigravity-cli) | `agy update` |
| [skills](https://github.com/anthropics/skills) | `npx skills update -g -p -y` |

Tools not installed on your machine are silently skipped.

### mise

If a tool was installed with [mise](https://mise.jdx.dev) (e.g. `mise use -g npm:@anthropic-ai/claude-code`), aiupdate detects it and runs `mise upgrade <tool>` instead of the tool's self-update command, which often refuses to update installs it doesn't own. Both shims and `mise activate` are supported. Upgrades follow the version requested in your mise config, so a tool pinned to an exact version stays put.

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
