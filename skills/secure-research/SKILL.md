---
name: secure-research
description: Use when the user wants to research, investigate, compare, or "find everything about" a topic and wants a cited, grounded report, optionally spread across several search engines (claude, codex, grok, agy, a self-hosted SearXNG). Privacy-aware - sensitive topics are gated, redacted, and kept on self-hosted SearXNG.
---

# secure-research

## Overview

Multi-source web research that ends in a cited report. You plan the research and write the report.
Parallel researchers, one per angle, gather the evidence on the search engines the user picks. Every
claim in the report must trace to a source a researcher actually quoted.

If the question is underspecified (e.g. "what car should I buy" with no budget, use or region), ask
2-3 clarifying questions first.

## Usage

`/secure-research <question> [--engines auto|claude,codex,agy,grok,searxng|all] [--mode rotate|all] [--breadth <n>]`

- **Engines.** `claude` · `codex` · `agy` · `grok` are model CLIs that each run their own web search.
  `searxng` queries a self-hosted SearXNG instance at `$SEARXNG_URL` (JSON format enabled), downloads
  the top result pages directly from this machine, and returns verbatim page excerpts (snippets where
  a page can't be fetched) that no third-party model reads. The default, `auto`, is
  `codex:gpt-6-luna@low` when codex is installed, else `claude:haiku`. `all` means `claude`,
  `searxng`, `codex` and `agy`. `grok` runs only when named, because its headless tool policy is
  unverified.
- **Models.** A model CLI takes an optional tune, `<engine>:<model>[@<effort>]`: for example
  `claude:sonnet` or `codex:gpt-6-luna@low`. Tunes of the same engine can run side by side in one run,
  which is how to compare models.
- **Mode.** `rotate` (the default) gives each angle one engine, round-robin, so cost stays flat. `all`
  runs every angle on every engine, for cross-engine corroboration at engine-count cost.

## Claude Code: use the workflow

If you have the **Workflow** tool, run the plugin workflow and relay its report. Do nothing else from
this file:

`Workflow({ name: "preflight:secure-research-workflow", args: { question, engines, engineMode, breadth } })`

`--mode` maps to `engineMode`. Pass `searxngUrl` too if `SEARXNG_URL` isn't set in the environment.
The `searxng`, `codex`, `agy` and `grok` researchers run through the same `research.mjs` engine, and
`claude` researchers run as native subagents, each shown as its own agent. On a sensitive topic it returns
`awaiting-confirmation` with the redacted plan: show that to the user, and re-run with
`sensitiveConfirmed: true` only after they approve.

## Every other harness: run it yourself

### 1. Scope (no web access yet)

- **Complexity.** Rate it simple, moderate or complex. That gives 1-2, 3-5 or 6-10 angles.
- **Angles.** Write distinct research angles, each with a `label`, a broad starting `query`, and a
  short `rationale`.
- **Sensitivity.** Classify the topic, conservatively: when in doubt, it is sensitive. A topic is
  sensitive if researching it would spread identifying or private terms across third-party search
  engines. That covers a named private person, health, legal or financial details tied to a person,
  a vulnerability in a specific target, credentials, account numbers, or internal codenames.
- **Redaction.** If the topic is sensitive, generalize the identifying details out of every query.
  Keep the full question only in your own context. Use at most 4 angles.

### 2. Gate sensitive topics

Before any query runs on a sensitive topic, show the user the redacted queries and wait for approval.
A sensitive run uses **only** `searxng`, whatever engines they asked for. The engine refuses anything
else, and refuses to run at all when `SEARXNG_URL` is unset. That holds in the Claude Code workflow
too, where searxng runs through the same engine.

### 3. Run the researchers

The script lives at `<this skill's base directory>/../../scripts/research.mjs`. Resolve it from the
base directory the harness gives you, and never guess another location. Write the plan to a temp
file, echo the command, then run it:

```
plan.json: {"question":"<question; the redacted form if sensitive>","angles":[{"label":"…","query":"…","rationale":"…"}],"sensitive":false,"alreadyCovered":[],"cursor":0}
node <resolved-path>/research.mjs run --plan <plan.json> --engines <list> [--mode rotate|all] [--breadth <n>] [--timeout 600] [--concurrency 6]
```

It prints JSON: `briefs[]` (each with `angle`, `engine`, `ok`, `usage` when the CLI reports it, and
either `findings` or `failure`), plus `perEngine` counts, `warnings` and `nextCursor`. Researchers can take several minutes, so allow a long command
timeout. `node research.mjs engines` lists which engines are usable on this machine.

- Exit 0 means at least one brief landed.
- Exit 1 means every engine failed. Relay each `failure` to the user; a credit or auth failure means
  they need to top up or log in.
- Exit 2 is a usage, plan or privacy refusal. Relay stderr verbatim.

**Do not search the web yourself.** The engines are the only researchers, which keeps every claim
traceable to a brief.

### 4. Gap check: one follow-up wave at most, never on sensitive topics

Read the briefs. If a facet of the question is uncovered, or a central claim rests on one weak
source, write up to 4 follow-up angles. Run the script once more with the source hosts already found
in `alreadyCovered` and `cursor` set to the first run's `nextCursor`, so the rotation continues. Don't
loop further.

### 5. Synthesize

- **Ground everything.** Every finding in the report cites at least one `sourceUrl` from the briefs,
  and its supporting `quote` must back it. Drop anything you can't ground; never add outside
  knowledge as if it were sourced.
- **Merge duplicates** into one finding with combined sources.
- **Confidence.** High when multiple independent or primary sources agree, medium for one good
  source, low for a single blog, forum post or thin snippet.
- **Cross-engine agreement.** The same claim found by two different engines is independent
  corroboration. A claim only one CLI engine found, citing a source no other engine surfaced,
  deserves caution: CLI engines can misquote or invent URLs.
- **SearXNG results.** Findings marked `raw: true` came from SearXNG: `fetched: true` ones are verbatim
  page excerpts picked by query terms, the rest are search snippets. Nothing has judged them yet, so
  read them as evidence to weigh, not as claims.
- **Quote fidelity differs by engine.** `claude` researchers read pages through WebFetch, which
  summarizes a page before the model sees it, so their "quotes" are often paraphrases. `codex` quotes
  raw pages and was far more often verbatim in testing. Weigh a finding by whether its quote reads
  as source text.
- **Report shape.** A 3-5 sentence summary, the findings with confidence and sources, caveats (weak
  sources, time-sensitivity, thin coverage), 2-4 open questions, and a line with the per-engine
  counts, including any engine that failed and why.

## Privacy note

A CLI engine (`claude`, `codex`, `agy`, `grok`) sends the full research prompt to its provider, and
that provider's search backend sees the queries. `searxng` sends the query text only to your own instance,
then downloads result pages directly: those sites see your machine's address, not the query. Redaction and a small angle count protect privacy more than the choice of engine
does.
