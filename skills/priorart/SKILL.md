---
name: priorart
description: Use when about to build something new (a script, service, wrapper, cache, retry layer, scheduler, integration, or helper), when asked to "write a script that…" or "add a … layer", or when patching a vendored or third-party install to add behavior.
---

# priorart

## Overview

Before you build, look for what already exists. The fix is often a config key, an existing script,
a recorded decision, or a maintained project. Finding it costs a few reads. Missing it costs a
duplicate that someone has to maintain and later delete.

## The search, in order

Report each step as done, with where you looked, before you propose any new code.

1. **The project's own record.** Read the decision log, notes, README, and design docs, and grep for
   the problem's keywords. A recorded decision can settle the approach ("rotation is handled by X,
   no cron scripts"). An existing mechanism may be present but broken, for example pointed at a stale
   path. If so, fixing it is the task.
2. **Existing code and scripts.** Search for existing helpers, scripts, and scheduled jobs that do
   this or nearly this.
3. **The components on either side.** Check whether the dependency you'd wrap already does it:
   read its full config or constructor options and its source, not your memory of it. Check the
   caller or client too. Caches, retries, validation, and refusals often already exist one layer up
   or down, sometimes switched off by default.
4. **Tools the platform already ships.** Look for OS or runtime facilities for the job, such as a
   log rotator, a scheduler, or a package's built-in feature.
5. **Maintained projects.** When nothing local fits, name one to three maintained open-source
   options. Give each one's fit against the actual requirements, its maintenance state, and your
   reason to adopt or reject it.

## Then choose, in this order of preference

1. Turn on or fix what exists, with config over code.
2. Extend it through its supported extension point, such as a config escape hatch, plugin
   directory, or hook.
3. Adopt a maintained project.
4. Build new, and say why steps 1 to 3 didn't fit.

**Vendored or managed code:** never edit a file marked vendored, generated, or "do not edit". Use its
options or an extension point, or re-vendor it.

**Existing target design:** if one exists, don't spend effort on a component it will replace. The
only exception is a stopgap for correctness or safety, labelled as a stopgap.

**Adopting something:** list the custom pieces it now makes redundant and propose removing them.

## Output

Open your reply with what you found, citing file:line or the source. Then give the smallest change
that uses it. If you still build new code, include one line per rejected alternative.
