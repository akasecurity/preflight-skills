# Changelog

Notable changes to flightcrew-skills. Format loosely follows Keep a Changelog;
versions follow semver.

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
