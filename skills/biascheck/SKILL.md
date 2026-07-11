---
name: biascheck
description: Use when the user wants an independent authenticity check of a piece of writing, a de-slop second opinion, or a read of whether a draft reads as AI-generated.
---

# biascheck

## Overview

An independent authenticity check of a draft: several neutral reads by one frontier model
(gpt-5.6-terra) score it 0-100 against a corpus-research reference and the median is reported with the
grounded tells. Report-only. Run the one script; do NOT perform the review by hand.

## Usage

Require a file: `/biascheck <file> [--reads <n>] [--read family[:tune]] [--item <label>] [--timeout <sec>]`

## Resolve the script

The script lives at `<this skill's base directory>/../../scripts/crew.mjs`. Resolve it from the base
directory the harness gives you for this skill; never guess or hardcode another location.

## Run it

Echo the exact command, then run it from the current repo root:

`node <resolved-path>/crew.mjs biascheck <file> [flags…]`

With no flags it runs 3 reads of gpt-5.6-terra at medium effort (codex CLI) and reports the median
authenticity score. `--reads` raises the read count for a steadier number on borderline drafts.

## After it finishes

- Surface compactly: the anchor, the READS line, the AUTHENTICITY median and spread, and each read's
  score, reasoning, and tells.
- Report-only: do NOT edit the draft. Applying fixes is the `unbias` skill's job, or the user's.
- The score is a signal, not a verdict; a single read is noisy, which is why the median and the spread
  are both shown. A plain, terse, or non-native-English voice is not itself a tell.
- On exit 1/2, relay the stderr message verbatim and surface any report that printed on stdout.
- The run appends telemetry to `~/.flightcrew/modelcalls.jsonl` and writes nothing into the reviewed repo.
