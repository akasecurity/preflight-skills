# Installing flightcrew-skills for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed

## Installation

Add flightcrew-skills to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["flightcrew-skills@git+https://github.com/akasecurity/flightcrew-skills.git"]
}
```

Restart OpenCode. The plugin installs through OpenCode's plugin manager and registers the
`crew-review` and `crew-consult` skills.

Verify by asking: "Use the skill tool to list skills" and confirm `crew-review` and `crew-consult`
appear.

OpenCode uses its own plugin install. If you also use Claude Code, Codex, or another harness,
install flightcrew-skills separately for each one.

## Usage

Use OpenCode's native `skill` tool:

```
use skill tool to load crew-review
use skill tool to load crew-consult
```

## Updating

OpenCode installs flightcrew-skills through a git-backed package spec. Some OpenCode and Bun
versions pin that resolved git dependency in a lockfile or cache, so a restart may not pick up the
newest commit. If updates do not appear, clear OpenCode's package cache or reinstall the plugin.

To pin a specific version:

```json
{
  "plugin": ["flightcrew-skills@git+https://github.com/akasecurity/flightcrew-skills.git#v0.2.1"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i flightcrew`
2. Verify the plugin line in your `opencode.json`
3. Make sure you're running a recent version of OpenCode

### Skills not found

1. Use the `skill` tool to list what's discovered
2. Check that the plugin is loading (see above)

### Tool mapping

Both skills speak in one action: run `node scripts/crew.mjs <review|consult> …` via a shell tool
and report its output. On OpenCode that resolves to the `bash` tool. Nothing else needs mapping —
neither skill asks questions, dispatches subagents, or tracks todos.

## Getting Help

- Report issues: https://github.com/akasecurity/flightcrew-skills/issues
