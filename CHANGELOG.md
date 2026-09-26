# Changelog

Notable changes to preflight-skills. Format loosely follows Keep a Changelog;
versions follow semver.

## [Unreleased]

### Added
- `secure-research`: cited web research spread across search engines (`claude`, `codex`, `agy`,
  `grok`, and a self-hosted SearXNG). `scripts/research.mjs` fans researchers out, per angle,
  round-robin or on every engine. The session model scopes the question, runs one bounded gap-check
  wave, and writes a report grounded in quoted sources. Sensitive topics are gated, redacted and kept
  on SearXNG, and the engine refuses other engines for them. Claude Code runs it as the
  `preflight:secure-research-workflow` Workflow, where each researcher shows as its own agent.

## [0.2.2] — 2026-07-20

### Changed
- Renamed the project to **preflight-skills** and the plugin id to **preflight** (was
  `flightcrew`). Reinstall as `preflight@akasecurity`. Telemetry now writes to `~/.preflight/`.

## [0.2.0] — 2026-07-09

First public release.

### Added
- `crew-review` — cross-family multi-model review of a git range: two blind reads
  (RECALL + PRECISION) plus an independent judge, report-only.
- `crew-consult` — the same two-reads-plus-judge pipeline over a design doc or file.
- `biascheck` — neutral median authenticity scorer for a writing draft (N reads of
  one model, median and spread reported).
- `unbias` — prompt-only de-slop pass applying the tells catalog in place.
- Zero-dependency engine `scripts/crew.mjs`; anchor-based freshness pinning; loud
  degradation on missing model seats.
