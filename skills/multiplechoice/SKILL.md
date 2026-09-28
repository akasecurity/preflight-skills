---
name: multiplechoice
description: Use when the user asks for the decisions they need to make or confirm, what was decided on their behalf, or for options with your recommendation. Also use on your own when two or more open decisions or judgment calls block the work, or before long autonomous execution that depends on the user's choices.
---

# multiplechoice

## Overview

Turn every open decision and every consequential call you made on the user's behalf into
multiple-choice questions, with your recommendation first, asked in rounds the user can answer. The
user can only decide what reaches a picker. A call you describe in prose never gets a vote.

## 1. Build the decision list

Collect all of the following, then sort them:

- **Open:** a choice you can't make from the request, the code, or a sensible default.
- **Made for you:** anything you decided without asking that a reasonable user might reverse. That
  includes tool or library picks, defaults, scope cuts, deletions, and readings of an ambiguous
  instruction.
- **Test-decidable:** a choice that measurement or an experiment you can run would settle. Don't ask
  the user to guess these. Propose the experiment as one question (run it, or skip it and take the
  default), and ask the resulting choice later, with the numbers.

Every open and made-for-you item becomes a picker question. Don't leave any of them as prose
"defaults unless you object". A clear correctness bug is not a decision: fix it and state it in one
line.

## 2. Check before you ask

- Verify the facts each option depends on (grep, file reads, a quick command). Don't frame options
  from memory.
- When a question rests on something the user said, quote their words and keep their scope. Don't
  widen or paraphrase it.
- Keep each option to a single premise. Split bundled actions such as "merge and tag" into
  separate options or questions.

## 3. Ask, one round per turn

Each question has:

- **stem:** the decision, plus the facts it turns on (numbers, file:line, cost), in plain words. Mark
  calls you made with "(made for you)".
- **header:** a chip of 12 characters or fewer.
- **2–4 options:** the recommended option first, with "(Recommended)" in its label. Each option's
  description gives a one-line consequence.

Send at most 4 questions per round, most blocking first. Open with one line of context, such as
"Round 1 of 3: the four that unblock the merge". Send one round, then **wait** for the answers
before the next.

Without a picker tool (such as `AskUserQuestion`), print the same round as a numbered list with
lettered options and your pick marked, then ask the user to reply like `1a 2c 3 other: …`.

## 4. After the answers

- **"Other" with a twist or a new option:** adopt it as stated.
- **A question back** ("what does X use?"): answer it, then re-ask that decision with the new facts
  in the stem.
- **A rejected premise:** fix the premise and re-ask. Don't argue for the original.
- **A non-recommended pick:** take it without re-arguing.

When every round is done, give a short table (decision → choice) and record it wherever the project
keeps decisions. Flag any choice that reverses an earlier decision, then continue the work.
