---
name: crew-review
description: Use when the user wants a second opinion on changes, a pre-merge review, or an independent multi-model read of a git commit range.
---

# crew-review

## Overview

Independent, multi-model review of a git diff. **Report-only** — it prints a report and never merges,
fixes, or mutates anything; acting on the verdict is the user's separate decision. The review is
produced by one script (`crew.mjs`): **run the script. Do not perform the review yourself or spawn
your own reviewer subagents.** Your job is to run it and surface its report faithfully.

## Usage

Require a git range: `/crew-review <git-range> [--item <label>] [--read family[:tune] ...] [--judge family[:model]] [--timeout <sec>]`

## Resolve the script

The script lives at `<this skill's base directory>/../../scripts/crew.mjs`. Resolve it from the
base directory the harness gives you for this skill — never guess or hardcode another location.

## Run it

Echo the exact command, then run it from the current repo root:

`node <resolved-path>/crew.mjs review <git-range> [flags…]`

Families: `claude` · `openai` (codex CLI) · `google` (agy CLI). With no flags the script detects
installed CLIs and prefers a cross-family crew automatically.

## After it finishes

- Surface compactly: the anchor, the CREW composition line, each read's verdict and findings, and
  the judge's verdict with its discarded/systemic lists.
- Preserve the report-only boundary: do NOT act on the verdict — no merge, no fix, no commit.
  Acting is the user's separate decision.
- On exit 1/2, relay the stderr message verbatim (it names the missing CLI, bad range, or usage
  problem) AND surface any report that printed on stdout — an exit 1 with all reads skipped still
  prints a useful report there.
- The run appends telemetry to `~/.preflight/modelcalls.jsonl` and writes nothing into the
  reviewed repo.
