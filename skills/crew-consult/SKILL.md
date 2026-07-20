---
name: crew-consult
description: Use when the user wants a multi-model second opinion on a design doc, plan, or spec before building.
---

# crew-consult

## Overview

Independent, multi-model review of a design or plan document. **Report-only** — it prints a report and
never edits the doc or triggers a build; acting on the verdict is the user's separate decision. The
review is produced by one script (`crew.mjs`): **run the script. Do not perform the review yourself or
spawn your own reviewer subagents.** Your job is to run it and surface its report faithfully.

## Usage

Require a file: `/crew-consult <file> [--item <label>] [--read family[:tune] ...] [--judge family[:model]] [--timeout <sec>]`

## Resolve the script

The script lives at `<this skill's base directory>/../../scripts/crew.mjs`. Resolve it from the
base directory the harness gives you for this skill — never guess or hardcode another location.

## Run it

Echo the exact command, then run it from the current repo root:

`node <resolved-path>/crew.mjs consult <file> [flags…]`

Families: `claude` · `openai` (codex CLI) · `google` (agy CLI). With no flags the script detects
installed CLIs and prefers a cross-family crew automatically.

## After it finishes

- Surface compactly: the anchor (the doc's sha256 digest), the CREW composition line, each read's
  verdict and findings, and the judge's verdict with its discarded/systemic lists.
- Preserve the report-only boundary: do NOT act on the verdict — no edits to the doc, no follow-up
  build. Acting is the user's separate decision.
- On exit 1/2, relay the stderr message verbatim (it names the missing CLI, bad file, or usage
  problem) AND surface any report that printed on stdout — an exit 1 with all reads skipped still
  prints a useful report there.
- The run appends telemetry to `~/.preflight/modelcalls.jsonl` and writes nothing into the
  reviewed repo.
