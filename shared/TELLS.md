# AI-writing tells — corpus research (2026-07-03)

## What this is

Two runs of the same research question on 2026-07-03, archived before the tmp outputs expired. The
question had two halves: **(1) AI-writing tells → what to STRIP**, and **(2) raw human casual-register
markers → what to KEEP**. Half 1 came back strong and corpus-backed; **half 2 came back empty** (see
"The half-2 gap"). This file is the full citation trail + the do-not-cite list.

| Run | Verifier | Confirmed / killed | Notes |
|-----|----------|--------------------|-------|
| A | more rigorous verify | 20 / 5 | fewer false kills |
| B | aggressive verify | 7 / 18 | over-refuted (killed true claims) |

Same prompt. They agreed on the core findings; they **disagreed on the "delve" fold-change** (below),
a live example of the A/B lesson that the aggressive verifier over-refutes.

## Validated — the "what to strip" list

**1. The vocabulary avoid-list is real and replicated** (high). Post-ChatGPT prose spikes a shared set
of "excess style words": delve/delves/delving, underscore, meticulous, boast, commendable, showcase,
surpass, intricate, tapestry, realm, pivotal, comprehensive, foster, testament, nuanced, plus
emotionally-evocative amidst, camaraderie, palpable. In GPT-4o output some run 100×+ the human rate
("tapestry" in 23% of outputs, "amidst" in 27%).
*Sources:* Kobak et al., *Science Advances* (15M PubMed abstracts); Matsui, *Perspectives on Medical
Education* / medRxiv (27.5M records; 103/135 tracked terms up significantly, β=0.655, p<0.001); Juzek &
Ward, COLING 2025 (21 "focal words"); PNAS/CMU Feb 2025 (the 100×+ figures).

**2. The tell is a VERB/ADJECTIVE phenomenon, not nouns** (high — the single most actionable finding).
Of ~280 excess style words in 2024, **66% verbs, 18% adjectives** — the inverse of pre-ChatGPT (mostly
nouns). Scrub the verb/adjective layer (showcase, foster, underscore, enhance, meticulous, robust), not
just a noun blacklist. Kobak et al., *Science Advances*, 3-0 unanimous.

**3. Prevalence** (high). At least 10% of 2024 biomedical abstracts show LLM processing (up to 30-40% by
field), an effect "larger than any prior linguistic event including COVID-19." Kobak et al. → treat the
tells as a strong current signal, not a fringe pattern.

**4. Em-dash survives explicit prohibition** (medium — single preprint). Told "do not use em dashes,"
GPT-4.1 still ran 3.86 and DeepSeek V3 1.57 per 1,000 words; unconstrained, GPT-4.1 hit 10.62 and Claude
Opus 9.09 vs a human baseline ~3.23 (itself ranging 0.33-17.12 — high human variance); Llama produced
zero in any condition. → **Always do a literal em-dash strip pass; the instruction alone is
unreliable.** And the tell is "above the human mean," not "any em-dash = AI." *Source:* Freeburg, "The
Last Fingerprint," arXiv:2603.27006 (single-author, non-peer-reviewed, ~10k words/model — "one study
found," not consensus).

**5. Structural / stylometric tells** (medium). AI prose clusters at **uniform sentence/paragraph
length** (humans vary widely), is more grammatically standardized, less lexically diverse, and
**over-uses causal connectors** ("because"/"due to") by 50-67%. → Inverse for raw human voice: **vary
sentence and paragraph length deliberately** (cheapest human tell to add), keep grammar loose
(fragments, slips), cut reflexive causal glue. *Sources:* Przystalski et al., *Expert Systems with
Applications* (arXiv:2507.00838, SHAP on stylometric classifiers); PMC12969083; ACM CODS-COMAD.

## The inverse — what raw human casual writing looks like

The mirror image of the tells above, and a positive signal in its own right. Unpolished human writing,
especially in casual registers (chat, texts, quick posts), tends to carry: left-in typos, sentence
fragments, tense slips, comma splices, dropped subjects ("Sounds good" for "That sounds good"),
trailing-off mid-thought, no sign-off or a one-word one, register-mixing, and mid-thought openers that
assume shared context. These are weak, un-corpus-validated markers individually, but their *presence* is
a genuine human signal, and their total *absence* from an otherwise-casual passage is itself suspicious:
a short, informal-sounding piece that is nonetheless clean, complete-sentenced, and tidily signed off is
more likely edited or generated than a messy one. Do not penalize these features as errors; count them
toward human authorship.

## Do NOT cite — refuted or contested in verification

- **"delve up 25.2× / 28× / +6,697%"** — the eye-catching multiplier. One run confirmed it
  high-confidence (Juzek & Ward's 0.21→14.38 per million ≈ 68×; Kobak's excess ratio r=25-28); the
  other run **refuted it 0-3 as weak/blog-sourced.** Reconciliation: delve *is* strongly elevated
  (real primary sources), and that refutation is itself likely over-refutation. But the numbers are
  metric-dependent and contested, so **cite the cleaner peer-reviewed figures** — 100× for tapestry/
  amidst (PNAS), 103/135 terms up (Matsui), ≥10% of abstracts (Kobak) — rather than a single delve
  multiplier.
- **RLHF-entropy as the proven cause** — refuted 0-3. Only "NOT model architecture, NOT training-data
  composition" is established (Llama-2-Base vs -Chat held architecture constant). RLHF/instruction-tuning
  is the leading *hypothesis*, not proven.
- **"AI has HIGHER lexical diversity"** — refuted; only holds under adversarial author-impersonation
  prompting. Default AI generation is *less* lexically diverse (see finding 5).
- **AI uses 54-72% less netspeak / 96-132% more positive-emotion / more certainty markers** — refuted 0-3.
- **Subject-deletion is systematic in casual texting** — the ONE half-2 (what-to-keep) claim actually
  tested. **Refuted 0-3.** The clearest signal that the human-marker half isn't served by this literature.
- Stylometric-detector stats (66% classifier accuracy, GPTZero <55% human, 23% unique bigrams,
  present-participle/nominalization multipliers) — refuted or split; don't rely on them.

## The half-2 gap — why "what to keep" isn't here

Across both runs, **zero** surviving claims address the raw/casual human markers (left-in typos,
fragments, tense slips, comma splices, dropped subjects, trailing-off, no sign-off, register-mixing,
mid-thought openers). Diagnosis: `deep-research` is a **claim-verification engine** — its adversarial
verifier refutes qualitative style/craft claims *by design* (subject-deletion died 0-3 not because it's
false but because it isn't a crisply-falsifiable, primary-sourced claim), compounded by thin coverage
(the evidence is scattered CMC/sociolinguistics work, not a quantitative corpus). Both runs concluded the
same: **the "what to keep" half must rest on your own mined anchor data** (a personal corpus of
casual writing) plus the inverse of the tells above. Not an
external-research problem — don't re-run the research for it.

## Standing caveats

- **Corpus skew:** all high-confidence evidence is academic/biomedical prose (PubMed/arXiv), not
  texts/chat/posts. The *vocabulary* transfers as a general LLM fingerprint; the *structural* findings
  and exact frequencies are less validated for short casual writing.
- **Decay:** the list ages. "delves" is already declining as writers/detectors adapt; tested models
  (GPT-3.5/4, Llama 2/3, GPT-Neo, Falcon, Bloom) skew older than current frontier. Refresh every ~12-18
  months (matches the guide's own note).

## Primary sources

- Kobak et al., *Science Advances* — https://arxiv.org/html/2406.07016v1
- Matsui, *PME* / medRxiv — https://pmejournal.org/articles/10.5334/pme.1929 · https://www.medrxiv.org/content/10.1101/2024.05.14.24307373v2.full · https://pmc.ncbi.nlm.nih.gov/articles/PMC12679996/
- Juzek & Ward, COLING 2025 — https://arxiv.org/pdf/2412.11385
- PNAS (CMU) — https://pnas.org/doi/10.1073/pnas.2422455122
- Przystalski et al., *Expert Systems with Applications* — https://arxiv.org/abs/2507.00838
- Freeburg, "The Last Fingerprint" (preprint) — https://arxiv.org/pdf/2603.27006
- "Delving into ChatGPT… excess vocabulary" — https://www.researchgate.net/publication/381318460
- ACM CODS-COMAD — https://dl.acm.org/doi/10.1145/3703323.3703712
- PMC structural — https://pmc.ncbi.nlm.nih.gov/articles/PMC12969083/
