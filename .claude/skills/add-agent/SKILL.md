---
name: add-agent
description: Add a new AI agent CLI tool to aiupdate. Use when a contributor wants to add support for a new agent (e.g. "add gemini", "support windsurf", "add <tool> to aiupdate").
---

Add a new AI agent CLI tool to aiupdate by following these steps:

## 1. Verify the tool is a real CLI

Check if it's installed and find its update subcommand:

```bash
which <tool>
<tool> --help 2>&1 | head -30
<tool> update --help 2>&1   # or upgrade, or whatever the subcommand is
```

## 2. Confirm the version flag

```bash
<tool> --version 2>&1
```

The version must match `/\d+\.\d+\.\d+/` (semver or date-based like `2026.05.09`). If it doesn't, set `versioned: false`.

## 3. Do a test run of the update command

```bash
<tool> <update-subcommand> 2>&1
```

Confirm it is non-interactive and exits cleanly.

## 4. Add to AI_TOOLS in src/cli.ts

Open `src/cli.ts` and add one line to the `AI_TOOLS` array:

```typescript
{ name: '<tool>', command: '<tool>', args: ['<update-subcommand>'], versioned: true },
```

## 5. Build and test

```bash
pnpm run build
aiupdate <tool>   # targeted run — confirm spinner shows and version is reported
```

## 6. Commit

```bash
git add src/cli.ts
git commit -m "Add <tool> to update list"
```

## Notes

- `versioned: true` → aiupdate shows "up to date (x.y.z)" or "x.y.z → a.b.c" after update
- `versioned: false` → just shows ✔ with no version info (use when `--version` output doesn't contain semver)
- Tools not installed on the user's machine are silently skipped at runtime — safe to add any tool
- The `skills` task (`npx skills update -g -p -y`) always runs regardless of targeted args — don't add it to `AI_TOOLS`
