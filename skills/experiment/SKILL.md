---
name: experiment
description: Use when a question could be settled by measuring instead of arguing, such as picking a tunable (batch size, concurrency, timeout, cache size, model setting), comparing two configurations, explaining a slowdown or regression, checking a claimed limit, or writing up benchmark results for a decision.
---

# experiment

## Overview

When a cheap measurement can settle a question, run it instead of reasoning toward an answer. Then
report only what the measurement supports. Every conclusion carries one of three labels: measured
(by this experiment), researched (from docs or a source), or inferred (reasoned, not tested).

## Before running

1. **Check the record.** Search notes and decision logs for earlier results. Design the experiment
   around what they left open, and don't re-run what is already settled. Treat an earlier result
   that lacks run count, conditions, or the metric you care about as a hypothesis, not evidence.
2. **Suspect your own side first.** Before blaming a dependency, a vendor, or contention, compare
   against your own recent config or code changes on the same input.
3. **Design the arms.**
   - Include a control: the current setting.
   - Change one variable at a time.
   - Use a real workload, such as replayed production traces, over a synthetic one.
   - Interleave the arms (A B A B) so drift hits both.
   - Run the control alone a few times first to measure the noise floor.
   - Plan at least 3 runs per arm.
   - Pick the metrics the user actually cares about, such as the tail latency, not just the
     average or throughput.
4. **Guard shared systems.**
   - Before each arm, confirm the resources are idle and no scheduled job overlaps.
   - Watch every entry path, not only the one you're driving.
   - Count your own earlier probes against any rate limit or counter.
   - If load starts on a shared or production system mid-arm, pause.
5. **Record the original state and plan its restore** before you change any config.

## While running

- Classify each run from the timeline before you look at its numbers. Write down each run's start
  and end, and the window of any other load. Every run whose window overlaps that load is
  contaminated, even if its numbers look normal. If you don't know when the other load ended, treat
  every run after it started as overlapping. Drop contaminated runs from the comparison, say so, and
  recount n from the clean runs only.
- A burst inside one window counts as one sample, not many.

## After running

- **Restore first.** Put back the original config and reload. Then confirm the running system
  reports the original value (not just the file). Do this before you write anything up.
- **Report:**
  - The table of clean runs, and the excluded runs with the reason for each.
  - n per arm and the noise floor.
  - The effect size with its spread.
- **Decide or don't.** If the effect is smaller than the noise, n is below 3, or clean runs
  disagree, the verdict is **inconclusive**. Say what re-run would settle it. Then fall back to the
  side that has evidence. Keep a current setting that was chosen on a measured basis. But if the
  current setting is a guard, check, cap or halt that was added without evidence, an inconclusive
  result is no reason to keep it: the guard never earned its place, so recommend removing or
  loosening it, and say that is the basis.
- **Trade-offs are choices.** When one metric improves and another regresses, put the trade-off to
  the user rather than choosing.
- **Tunables ship as settings.** Pick the default the evidence supports, not the most cautious
  one, and record the measured basis next to it.
- **The decision log records the evidence grade.** Write measured, inferred, or inconclusive, never
  "resolved" on thin data. When new evidence weakens an old entry, correct the old entry.
