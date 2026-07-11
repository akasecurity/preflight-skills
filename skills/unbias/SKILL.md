---
name: unbias
description: Use when the user wants to de-slop, humanize, unbias, or scrub their own draft, or to clean the writing they are working on of AI tells. Applies the BIAS.md tells catalog in the current session.
---

# unbias

## Overview

Apply the tells catalog at `../../shared/BIAS.md` to the draft the operator is working on, in this
session, with the model already loaded. No script, no external model calls. This is the fast, everyday
de-slop pass. For an independent, outside-family authenticity score, that is the separate `biascheck`
skill.

## Modes

- **review** (default): for each tell, quote the phrase, name the tell, propose the fix. Do not edit.
  Close with the cluster read: are the tells dense in one passage (AI-shaped) or scattered (probably
  just voice)?
- **apply**: rewrite in place, changing only what a flagged tell requires and preserving the author's
  voice, then give a one-line-per-fix change summary.

## The passes (run in order, from the catalog)

1. Scrub 1, machine tells: vocabulary by tier, punctuation led by the em-dash (do a literal strip
   pass), structure and rhythm. See `../../shared/BIAS.md`, "Scrub 1".
2. Scrub 2, reasoning-posture: the confession / defend / over-explain / announce-honesty family, at
   clause, paragraph, and section altitude. See "Scrub 2".
3. Cluster and false-positive guard: a single tell is noise; flag with confidence only on clusters.
   Preserve genuine human signal (specifics, dated references, real asides, plain or non-native voice).
   See "How to use this".

## Note

The catalog is the source of truth; do not restate its tell list here. Read `../../shared/BIAS.md`.
