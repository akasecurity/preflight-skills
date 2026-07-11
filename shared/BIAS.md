# BIAS.md

A field catalog of the tells that make writing read as machine-generated, each paired with a fix.

## How to use this

This catalog exists to help a writer, human or machine, self-edit before anything ships. Three rules
govern how to read it.

**Signals, not proof.** Nothing here is an attribution test or an integrity verdict. A tell only tells
you where to look twice.

**Clusters, not isolated hits.** One instance of any single item below is noise. Writers use semicolons,
hedge with a common qualifier, and occasionally reach for a word from the list below without a machine
anywhere near the draft. Confidence rises when several tells show up in the same paragraph, not when one
word appears once.

**Review, then decide.** The catalog names a pattern and proposes a fix. Whether a given sentence needs
that fix is a judgment call the writer makes, not something the catalog makes for them.

## The governing principle

State the fact, let the reader infer. Real-world writing presents a fact and trusts the reader to draw
the conclusion. The loudest, most consistent machine tell is the opposite move: explaining, in the same
breath, why the fact matters. Almost every pattern in the punctuation and structure sections below is a
variation on this one habit, so it is worth internalizing before the checklist.

Before: "The team shipped the update in four days, a pace that reflects how much the process has
matured since the last release."

After: "The team shipped the update in four days."

The second version is shorter and says less, but the reader still gets the same conclusion. They just
get to reach it themselves.

## Scrub 1: machine tells

This layer catches the vocabulary, punctuation, and rhythm patterns that flag a passage as machine
output before anyone even reads for meaning or argument.

### A. The tiered word list

Not every word on this list is equally damning. Treat it as three tiers of confidence.

**Always-replace.** High-confidence, corpus-backed. These words are rare enough in ordinary writing that
a single appearance is worth a second look: delve/delves/delving, underscore(s), intricate/intricacies,
showcase, tapestry, testament (to), realm, pivotal, boast(s), meticulous, commendable, garnered,
groundbreaking, foster, surpass, landscape (used figuratively, as in "the competitive landscape").

Fresh illustration. Before: "The onboarding guide delves into the intricacies of account setup, a
testament to the team's meticulous documentation." After: "The onboarding guide walks through account
setup."

**Cluster-flag.** Normal English. Each of these is a fine word on its own and a tell only when several
cluster in one passage, or when one of them is doing work a concrete fact should be doing: comprehensive,
crucial, notably, particularly, additionally, insights, enhance/enhancing, aligns, advancements, robust,
seamless, leverage, across, within.

Fresh illustration. Before: "The new dashboard offers comprehensive, robust insights that seamlessly
enhance decision-making across the organization." After: "The new dashboard shows revenue, churn, and
open tickets on one screen."

**Density-flag.** A wall of `~` and `+` hedge-quantifiers ("~9 releases," "40+ contributors," "~1.2M
rows") reads as machine output even when every individual number is accurate. Most of the time the
writer knows the number. Pick it, and drop the `~` or `+` unless the figure is genuinely an estimate.

The word list skews toward verbs and adjectives, not nouns. Kobak et al. found that most of the excess
vocabulary in AI-influenced writing (about 66% of it) is verbs, with another ~18% adjectives, a finding
all three of the paper's independent tests agreed on. That means a noun-only blacklist misses the bulk of
the signal. Scrub the verb and adjective layer specifically. Showcase, foster, underscore, and enhance
are verbs. Meticulous and robust are adjectives. Both classes matter more than a stray noun.

A decay note, stated once here so it doesn't need repeating per tier: this list will go stale. As
writers learn to avoid these words, and as detectors adapt, the highest-signal words shift. Treat the
tiers above as a snapshot, not a permanent ranking. Refresh cadence lives in the catalog's Half-life
section.

### B. Punctuation, led by the em-dash

**The em-dash appositive gloss.** This is the single hardest-hitting punctuation tell, and the one worth
scrubbing for first. The pattern: state a fact, drop an em-dash, then gloss its significance. Corpus
studies of AI-generated text consistently find the em-dash used at a noticeably higher rate than in
comparable human writing, which is what makes it such a reliable flag on its own. Fix: replace the
em-dash with a period or a comma, and in most cases delete the gloss entirely rather than just repunctuate
it. Do a literal search for the character as a separate pass. Some models keep using em-dashes even after
being told not to, so don't trust the instruction alone.

Fresh illustration. Before: "The migration finished over the weekend — a clear sign the new pipeline is
finally stable." After: "The migration finished over the weekend."

**Significance glosses.** Any trailing clause whose only job is to explain why a fact is impressive is the
same tell without the em-dash carrying it. Fix: delete the clause and let the fact stand.

Before: "Support tickets dropped by half after the redesign, showing just how much the old flow was
confusing users." After: "Support tickets dropped by half after the redesign."

**Trailing present-participle clauses.** A sentence that ends ", bringing…", ", enabling…", or
", leveraging…" is usually padding a plain fact with unearned motion. Fix: cut it, or promote it to its
own sentence if it actually carries new information.

Before: "The team rewrote the checkout flow, bringing the average completion time down and improving
overall conversion." After: "The team rewrote the checkout flow. Average completion time dropped."

**Semicolons stitching clauses.** In punchy, declarative copy, a semicolon usually means two sentences
got merged for a rhythm the writer didn't earn. Fix: split into two sentences.

Before: "The API is stable now; the team moved on to the next milestone." After: "The API is stable now.
The team moved on to the next milestone."

**Colon-introduced enumerations as a default cadence.** Reaching for "The results: faster load times,
fewer errors, happier users" every time a list shows up reads as a template, not a sentence. Fix: use a
plain sentence, and save the colon for when a list genuinely needs to be a list.

**Empty transitions and filler openers.** "It's worth noting," "In today's fast-moving landscape,"
"Needless to say," and similar throat-clearing add nothing before the actual point. Fix: delete the
opener and start on the fact.

Before: "It's worth noting that the deploy went out an hour late." After: "The deploy went out an hour
late."

**Over-formatting.** Bold runs and bullet lists are rewarded heavily in a lot of model training, so
default output over-scaffolds even plain paragraphs. Fix: for anything meant to be read as prose, use
running paragraphs. Reserve bold for genuine emphasis and bullets for content that is actually a list,
not for breaking a paragraph into visually distinct chunks.

Before: "The rollout had **three phases**: first, **the beta cohort** tested the new flow; second,
**the wider team** got access; third, **everyone else** followed a week later." After: "The rollout ran
in three phases. The beta cohort tested the new flow first, the wider team got access next, and everyone
else followed a week later."

### C. Structure and rhythm

**Uniform sentence and paragraph length.** Machine-generated passages tend to cluster tightly around one
sentence length and one paragraph length, where human writing varies widely, even from one sentence to
the next. This is corpus-backed by Przystalski et al., whose SHAP analysis of stylometric classifiers
found sentence-length uniformity among the strongest signals the classifiers relied on. Fix: vary length
on purpose. It's the cheapest single change that makes a passage read human.

**Over-use of causal connectors.** "Because" and "due to" show up more often in machine-generated text
than in comparable human baselines, per the same stylometric work. Most of the time the causal link is
either obvious from context or not actually load-bearing. Fix: cut the connector and let the two facts
sit next to each other, or state the causal claim only when it's genuinely doing work.

Before: "Load times improved because the team removed the unused tracking scripts." After: "The team
removed the unused tracking scripts. Load times improved."

**Reflexive rule-of-three, and "not X but Y" antithesis used for rhythm.** A tidy triad ("faster,
cleaner, and more reliable") or a "not X, but Y" construction can be exactly right when there are really
three things, or when a real misconception needs correcting. Used reflexively, for cadence alone, both
read as manufactured symmetry. Fix: count what's actually true. If there are two things or four, write
two or four. If nobody believed X, don't set it up just to knock it down.

## Scrub 2: reasoning-posture

Layer A catches surface tells: word choice, punctuation, rhythm. A passage can pass every check above,
no em-dash, no delve, sentence lengths all over the map, and still read as junior. Layer B is aimed at
that remainder. It catches something underneath the surface, in the posture a passage takes toward its
own claims.

The epistemic status of this layer differs from Layer A's. Layer A is corpus-backed: the word tiers,
the em-dash rate, the sentence-length uniformity all trace back to published stylometric work, cited
above. Layer B is different in kind. It is an observed editorial
pattern, distilled from watching the same moves get cut, over and over, by senior editors marking up
real drafts. The mechanism behind it is a hypothesis, not a finding: helpfulness and honesty training
rewards hedging a claim, disclosing a limitation, and explaining a piece of reasoning, and that reward
plausibly shows up in prose as the tells below. Nobody has run the corpus study that would confirm the
mechanism. What repetition across many independent edits does confirm is the pattern itself: these moves
read as junior, and the rewrite reads as senior. Treat this layer for the pattern and the rewrite it
implies, not as a citation.

### A. Confessing an unresolved issue inside the artifact

Volunteering a caveat about the work, inside the piece that presents the work, reads as an admission
rather than a disclosure. "This only works if traffic stays under a thousand requests a second" or "the
one thing this script doesn't handle is a mid-run restart" tells the reader the author is bracing for a
problem instead of standing behind the result. Fix: track the open issue where it belongs, a ticket, a
code comment tied to the actual limitation, a conversation with whoever owns the risk, not inside the
deliverable meant to represent the work as it stands.

Before: "The new caching layer speeds up most reads significantly, though it's worth noting it doesn't
yet handle cache invalidation on writes from the admin panel, which is something to fix eventually."

After: "The new caching layer speeds up most reads significantly."

### B. Arguing with a critic nobody raised

A defensive disclaimer that pre-empts a criticism nobody made is a tell that the writer is bracing for
judgment it hasn't received yet. "These are convenience helpers, not a replacement for proper error
handling" or "this isn't meant to be a full design system, just a starting point" answers an objection
that was never raised, and in doing so plants it in the reader's mind. Fix: state what the thing is and
stop there. Answer the objection if and when someone actually raises it.

Before: "This library provides a handful of formatting utilities. To be clear, this is not a full
internationalization framework, and it doesn't attempt pluralization or locale-aware sorting."

After: "This library provides a handful of formatting utilities."

### C. Narrating a failure just to reassure against it

A close cousin of B, with a different shape: a volunteered bad outcome, followed by a promised remedy.
"If the creek is running too high to cross, there's a marked bypass so no hiker has to turn back"
reads as bracing for a bad day rather than describing a good trail. The tell isn't the remedy itself. A
plainly posted fact, the loop closes at dusk, or the water fountain sits at the halfway point, is a fine
thing to include. The tell is the failure scenario built around the remedy, the "in case this goes
wrong" framing that raises the worry it then answers. Fix: describe the thing as it is. If a contingency
genuinely needs recording, record it where a hiker looks for it, on the map legend, not woven into the
opening description of the route.

Before: "The new ridge loop is open for the season. If the upper switchbacks are still iced over,
there's a lower alternate route so nobody gets stranded near the summit."

After: "The new ridge loop is open for the season."

### D. Announcing your own honesty, precision, or tradeoff

"To be candid," "it's worth being precise here," "the trade-off is deliberate:" all narrate the act of
being careful instead of just being careful. Fix: skip the announcement. State the precise thing, or name
the tradeoff as a plain fact, and let the precision do its own work.

Before: "To be fully transparent, results are cached for five minutes rather than served live, and this
is a deliberate trade-off between freshness and server load."

After: "Results are cached for five minutes to reduce server load."

### E. Over-explaining significance at every altitude

This is the catalog's governing principle, applied one level deeper than a single sentence. At the
sentence level it's the significance-gloss clause covered under Scrub 1. The same habit also shows up at
larger scale: a whole paragraph that restates a point the piece already made with data, or a closing
section whose only job is to summarize a conclusion the reader reached three sections earlier. A recipe
that walks the cook through folding, resting, and shaping a dough doesn't need a final paragraph
declaring that patience is the real secret to good bread. The steps already showed it.

Check every sentence for a trailing gloss, every paragraph for restated ground, and every section for a
summary the piece has already earned by then.

### The corollary: stating the fact is not giving zero context

The governing principle is easy to over-apply into stripping context a reader genuinely needs. When a
fact depends on knowledge the audience doesn't have, restore the missing piece as the plain result of
the fact, at the same altitude as the fact itself. Not a tutorial on the underlying idea, and not a
scene painted to feel vivid.

Before, over-explained: "The rear derailleur is now indexed. Indexing is the process of aligning the
shifter's click positions with the cassette cogs, a fundamental of drivetrain tuning, and getting it
right is what separates a smooth-shifting bike from a poorly maintained one."

Before, over-corrected toward zero context: "The rear derailleur is now indexed."

After: "The rear derailleur is now indexed, so the chain lands cleanly in the gear you select instead
of skipping or rattling between two."

A quick test: would a reader who has never heard the term still see, from this one sentence, what
changed for them? If the bare fact fails that test, add what it does for the reader, not a definition of
the term.

For an independent, multi-model authenticity check of a draft against this catalog, run the `biascheck` skill (`/biascheck <file>`). It reads the draft with models from a different family than wrote it and returns a score with the grounded tells.

## Half-life

The word tiers in Scrub 1 are a snapshot of current usage, not a permanent ranking. As writers learn to
avoid a flagged word, and detectors adjust to whatever replaces it, the highest-signal vocabulary keeps
moving. A word rare enough today to flag on a single appearance may be common again within a year.
Revisit the tiers on a rough twelve to eighteen month cadence, checking them against current published
research rather than assuming last year's list still holds.

The structural findings in Scrub 1 section C, and the reasoning-posture patterns in Scrub 2, decay more
slowly. They describe a rhythm and a posture rather than a specific vocabulary. The same discipline still
applies: revisit periodically, and don't treat any layer here as fixed.

The published sources behind Scrub 1, for checking whether the current tiers still hold:

- Kobak et al., *Science Advances*. Analyzed 15 million PubMed abstracts and found the shift in word
  usage larger than any prior linguistic change on record, including COVID-19.
  https://www.science.org/doi/10.1126/sciadv.adt3813
- Matsui, *Perspectives on Medical Education* / medRxiv. Tracked 135 terms across 27.5 million records
  and found 103 of them increased significantly. https://pmejournal.org/articles/10.5334/pme.1929
- Juzek & Ward, COLING 2025. Tracked 21 focal words and found some rose from under one occurrence per
  million words to well over ten. https://arxiv.org/pdf/2412.11385
- Reinhart et al., PNAS, February 2025. A Carnegie Mellon-led study finding that LLM writing carries a
  distinctive grammatical and rhetorical style and, unlike human writers, does not adapt that style to
  the context or genre. https://pnas.org/doi/10.1073/pnas.2422455122
- Przystalski et al., *Expert Systems with Applications*. SHAP analysis of stylometric classifiers, the
  source for the structural and rhythm findings in Scrub 1 section C. https://arxiv.org/abs/2507.00838

## Caveat

None of the checks in this catalog are a test for authorship. They are prompts to look again at a
passage, and looking again can be wrong in both directions. Genuinely human writing gets flagged
sometimes, and at a real rate, so it's worth understanding why before pointing this catalog at anyone
else's work.

Automated AI-text detectors are documented to be biased against non-native English writers. Liang et al.
(2023, published in *Patterns*) tested seven commercial GPT detectors against US eighth-grade essays and
TOEFL essays written by non-native English speakers. The detectors were near-perfect on the eighth-grade
essays and wrong on more than half of the TOEFL essays, misclassifying writing that was entirely human as
AI-generated. The essays that got flagged tended to use simpler, lower-perplexity language, the same
plainness this catalog treats as a virtue elsewhere. A tool built to catch machine writing can end up
penalizing anyone whose natural register is plain, constrained, or shaped by a second language.
https://pmc.ncbi.nlm.nih.gov/articles/PMC10382961/

This catalog isn't an automated detector, but a person running it by eye can make the same mistake. A
writer with a naturally plain style can trip several of the surface tells honestly. So can a non-native
writer, or someone following a house style that already favors short sentences. That's exactly why
clusters matter more than single hits throughout this catalog. A single flagged word proves nothing on
its own, and neither does one uniform paragraph or one stray causal connector. A cluster of several
tells in the same passage is worth a second look. That same cluster in someone's own unedited writing
is usually just their voice.

Treat everything in BIAS.md as a self-editing aid, something a writer runs against their own draft before
it ships. It is not an attribution test and not an integrity verdict, and it was never built or validated
to answer either question. Using it to accuse another writer of using AI stretches it well past what it
can support.
