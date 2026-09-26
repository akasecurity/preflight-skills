#!/usr/bin/env node
// research.mjs — the search-engine fan-out behind secure-research. Takes a research plan (a
// question plus angles), runs one web researcher per (angle, engine) job across the model CLIs
// on PATH and a self-hosted SearXNG, and prints the researchers' cited briefs as JSON. It does
// no scoping, gap-checking or synthesis. The calling session model does those (see
// skills/secure-research/SKILL.md), so the engine stays the same in every harness.
import { pathToFileURL } from "node:url";
import { readFileSync, accessSync, statSync, mkdtempSync, rmSync, constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { runSeat, extractJson, reapAllSeats } from "./crew.mjs";

export const USAGE = `usage: research.mjs engines
       research.mjs run --plan <plan.json> [--engines e1,e2|all] [--mode rotate|all] [--breadth <n>] [--sensitive] [--timeout <sec>]
engines: claude · codex · agy · grok (model CLIs, each runs its own web search) · searxng (needs SEARXNG_URL)
plan.json: {"question":"…","angles":[{"label":"…","query":"…","rationale":"…"}],"alreadyCovered":["host", …],"sensitive":false}`;

export const ENGINES = ["claude", "searxng", "codex", "grok", "agy"];
const CLI_BIN = { claude: "claude", codex: "codex", grok: "grok", agy: "agy" };

// A second, third… researcher on the same angle gets a different lens, so extra breadth buys
// distinct recall rather than a repeated search.
export const LENSES = [
  "",
  "Bias this pass toward the most RECENT developments: latest releases, news and announcements.",
  "Bias this pass toward PRIMARY sources: official sites, documentation, first-hand accounts.",
  "Bias this pass toward critical, skeptical or contrarian sources that mainstream coverage misses.",
  "Bias this pass toward practitioner experience: forums, issue trackers, hands-on reviews.",
];

export const BRIEF_CONTRACT = `Reply with ONLY one JSON object, no prose and no code fence:
{"coverageNote":"<what this angle turned up and what it could not find>","searchesRun":<int>,"findings":[{"claim":"<concrete, checkable claim>","confidence":"high|medium|low","sourceUrl":"<URL you actually retrieved>","sourceTitle":"","sourceQuality":"primary|secondary|blog|forum|unreliable","quote":"<direct supporting quote from that source>","importance":"central|supporting|tangential"}]}
Up to 8 findings. If you find nothing usable, return an empty findings array and say why in coverageNote.`;

// ── engine bindings ─────────────────────────────────────────────────────────
// Every CLI binding is read-only apart from web access. packetVia "stdin" pipes the prompt;
// "arg" passes the whole prompt as the final argument. agy and grok need "arg": headless agy
// auto-denies the read_file permission a temp-file packet would need, and prints nothing.
export function bindingFor(engine, timeoutSec) {
  if (engine === "claude") {
    return { packetVia: "stdin", argv: ["claude", "-p", "--model", "haiku", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch", "WebFetch", "--no-session-persistence"] };
  }
  if (engine === "codex") {
    return { packetVia: "stdin", argv: ["codex", "--search", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-"] };
  }
  if (engine === "agy") {
    // Headless agy auto-denies any tool that needs a permission prompt, including read_url, and a
    // single denial ends the turn with no output. Its allow-rules are per-domain (read_url(<domain>))
    // and live in the user's global settings, which don't fit research across arbitrary sites. So
    // agy runs with auto-approve, but inside --sandbox (restricted terminal) and an empty throwaway
    // workspace (see runResearch). It can read the web and nothing of the user's.
    return { packetVia: "arg", argv: ["agy", "--sandbox", "--dangerously-skip-permissions", "--print-timeout", `${timeoutSec}s`, "-p"] };
  }
  if (engine === "grok") {
    return { packetVia: "arg", argv: ["grok", "-p"] };
  }
  return undefined;
}

export function detectEngines(env = process.env) {
  const found = new Set();
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const [engine, bin] of Object.entries(CLI_BIN)) {
    for (const dir of dirs) {
      try {
        const p = join(dir, bin);
        accessSync(p, fsConstants.X_OK);
        if (!statSync(p).isFile()) continue;
        found.add(engine);
        break;
      } catch { /* keep looking */ }
    }
  }
  if (env.SEARXNG_URL) found.add("searxng");
  return found;
}

// ── prompts ─────────────────────────────────────────────────────────────────
export function researcherPrompt(plan, angle, { lens = "", alreadyCovered = [] } = {}) {
  return [
    "=== RESEARCH BRIEF ===",
    `You are one of several web researchers investigating a question in parallel. You are a RETRIEVER: search, read, and return cited findings, not raw pages. A later step makes the final trust judgment, so favor recall: when unsure whether something is relevant, include it with its quote and source. Own this angle end to end.`,
    "",
    `Research question: ${plan.question}`,
    `Your angle: ${angle.label}${angle.rationale ? ` (${angle.rationale})` : ""}`,
    `Starting query: ${angle.query}`,
    lens ? `Lens: ${lens} Other researchers cover the broad view.` : "",
    plan.sensitive ? "This topic is privacy-sensitive and the starting query is deliberately generalized. Keep every search generalized. Do not re-add names, addresses, account numbers, codenames or target-specific detail." : "",
    alreadyCovered.length ? `Already covered by earlier researchers (go deeper or elsewhere): ${alreadyCovered.join(", ")}` : "",
    "",
    "Method: search broad first, then narrow. Open the most promising sources and quote them directly. Prefer primary and authoritative sources over SEO content farms. Never cite a URL you did not retrieve. Run roughly 3-8 searches or fetches and stop once the angle is answered. Do not edit files or run shell commands.",
  ].filter((l) => l !== "").join("\n");
}

// ── briefs ──────────────────────────────────────────────────────────────────
const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
export function normalizeBrief(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.findings)) return undefined;
  const findings = obj.findings
    .filter((f) => f && typeof f === "object" && typeof f.sourceUrl === "string" && /^https?:\/\//.test(f.sourceUrl) && f.quote && f.claim)
    .slice(0, 8)
    .map((f) => ({
      claim: String(f.claim),
      confidence: pick(f.confidence, ["high", "medium", "low"], "low"),
      sourceUrl: f.sourceUrl,
      sourceTitle: f.sourceTitle ? String(f.sourceTitle) : "",
      sourceQuality: pick(f.sourceQuality, ["primary", "secondary", "blog", "forum", "unreliable"], "secondary"),
      quote: String(f.quote),
      importance: pick(f.importance, ["central", "supporting", "tangential"], "supporting"),
    }));
  return { coverageNote: String(obj.coverageNote ?? ""), searchesRun: Number.isInteger(obj.searchesRun) ? obj.searchesRun : undefined, findings };
}

// A CLI that answered with a parseable brief succeeded, whatever its stderr says. Otherwise name
// the failure, singling out credit/auth problems so the caller can tell "top up" from "broken".
const AUTH_RE = /\b402\b|\b401\b|\b403\b|\b429\b|balance exhausted|credit balance|quota|usage limit|rate limit|unauthori[sz]ed|not logged in|login required/i;
export function failureReason(engine, result, brief) {
  if (brief) return undefined;
  const text = `${result.stdout}\n${result.stderr}`;
  if (result.outcome === "timeout") return `${engine} timed out`;
  if (AUTH_RE.test(text)) return `${engine} auth/credit failure: ${text.match(AUTH_RE)[0]}`;
  if (result.outcome === "error") return `${engine} exited ${result.code ?? "abnormally"}${result.stderr ? `: ${result.stderr.trim().split("\n").at(-1).slice(0, 160)}` : ""}`;
  return `${engine} returned no parseable brief`;
}

// SearXNG returns search results, not an answer. The engine hands the raw snippets back as
// low-confidence findings and no third-party model reads them. The calling session model, which
// already holds the question, weighs them at synthesis. That is what keeps a sensitive topic's
// fan-out on self-hosted infrastructure.
export async function runSearxng(angle, { baseUrl, fetchImpl = fetch, timeoutMs = 25_000, limit = 8 }) {
  const started = Date.now();
  const url = `${baseUrl.replace(/\/+$/, "")}/search?format=json&q=${encodeURIComponent(angle.query)}`;
  let results;
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { failure: `searxng HTTP ${r.status}`, ms: Date.now() - started };
    results = (await r.json()).results ?? [];
  } catch (e) {
    return { failure: `searxng unreachable: ${String(e?.message ?? e).slice(0, 160)}`, ms: Date.now() - started };
  }
  const seen = new Set();
  const findings = [];
  for (const r of results) {
    if (!r?.url || seen.has(r.url) || !r.content) continue;
    seen.add(r.url);
    findings.push({
      claim: String(r.title ?? r.url), confidence: "low", sourceUrl: r.url, sourceTitle: String(r.title ?? ""),
      sourceQuality: "secondary", quote: String(r.content).slice(0, 400), importance: "supporting", raw: true,
    });
    if (findings.length >= limit) break;
  }
  return {
    brief: { coverageNote: `SearXNG: ${results.length} results, ${findings.length} snippets kept (raw snippets, not model-read)`, searchesRun: 1, findings },
    ms: Date.now() - started,
  };
}

// ── job assignment ──────────────────────────────────────────────────────────
// rotate: each (angle, lens) slot gets one engine, round-robin from `cursor`, so cost stays flat.
// all: each slot runs on every engine, for cross-engine corroboration at engine-count cost.
export function assignJobs(angles, engines, { mode = "rotate", breadth = 1, cursor = 0 } = {}) {
  const jobs = [];
  let c = cursor;
  angles.forEach((angle, a) => {
    for (let v = 0; v < breadth; v++) {
      const targets = mode === "all" ? engines : [engines[c++ % engines.length]];
      for (const engine of targets) jobs.push({ angleIndex: a, angle, lens: v, engine });
    }
  });
  return { jobs, cursor: c };
}

// Sensitive topics never go to a third-party model provider: the engine list collapses to
// searxng, and a sensitive run without SearXNG is refused rather than silently widened.
export function resolveEngines(requested, available, { sensitive = false } = {}) {
  const warnings = [];
  const wanted = requested.includes("all") ? ENGINES : requested;
  const unknown = wanted.filter((e) => !ENGINES.includes(e));
  if (unknown.length) return { ok: false, error: `unknown engine(s): ${unknown.join(", ")}` };
  if (sensitive) {
    if (!available.has("searxng")) return { ok: false, error: "sensitive topic: only the searxng engine is allowed, and SEARXNG_URL is not set" };
    if (wanted.some((e) => e !== "searxng")) warnings.push(`sensitive topic: ran on searxng only (requested ${wanted.join(",")})`);
    return { ok: true, engines: ["searxng"], warnings };
  }
  const usable = [...new Set(wanted)].filter((e) => {
    if (available.has(e)) return true;
    warnings.push(e === "searxng" ? "searxng skipped: SEARXNG_URL is not set" : `${e} skipped: '${CLI_BIN[e]}' not found on PATH`);
    return false;
  });
  if (!usable.length) return { ok: false, error: `none of the requested engines is available (${wanted.join(", ")})` };
  return { ok: true, engines: usable, warnings };
}

// ── run ─────────────────────────────────────────────────────────────────────
export async function runResearch(plan, { engines, mode = "rotate", breadth = 1, timeoutSec = 600, env = process.env, fetchImpl, cwd } = {}) {
  const { jobs } = assignJobs(plan.angles, engines, { mode, breadth });
  const perEngine = Object.fromEntries(engines.map((e) => [e, { researchers: 0, findings: 0, failed: 0 }]));
  const briefs = await Promise.all(jobs.map(async (job) => {
    const stats = perEngine[job.engine];
    stats.researchers++;
    const base = { angle: job.angle.label, engine: job.engine, lens: job.lens };
    let brief, failure, ms;
    if (job.engine === "searxng") {
      ({ brief, failure, ms } = await runSearxng(job.angle, { baseUrl: env.SEARXNG_URL, ...(fetchImpl ? { fetchImpl } : {}) }));
    } else {
      // An angle may carry its own lens (the Claude workflow adapter sends one angle per call).
      const lens = job.lens > 0 ? LENSES[job.lens % LENSES.length] : (job.angle.lens ?? "");
      const prompt = researcherPrompt(plan, job.angle, { lens, alreadyCovered: plan.alreadyCovered ?? [] });
      const b = bindingFor(job.engine, timeoutSec);
      // runSeat pipes brief+contract+packet on stdin. For an "arg" engine the same text also rides
      // as the final argument, which is what the CLI actually reads.
      const seat = { ...b, packetVia: "stdin", argv: b.packetVia === "arg" ? [...b.argv, `${prompt}\n\n${BRIEF_CONTRACT}`] : b.argv, brief: prompt, contract: BRIEF_CONTRACT };
      // Each CLI runs in its own empty directory, never the caller's repo: web research needs no
      // files, and a prompt injection in a fetched page then has nothing to read or touch.
      const jobDir = cwd ?? mkdtempSync(join(tmpdir(), "research-"));
      const result = await runSeat(seat, "", timeoutSec * 1000, { cwd: jobDir });
      if (!cwd) rmSync(jobDir, { recursive: true, force: true });
      ms = result.ms;
      brief = normalizeBrief(extractJson(result.stdout, "findings"));
      failure = failureReason(job.engine, result, brief);
    }
    if (failure) { stats.failed++; return { ...base, ok: false, failure, ms }; }
    stats.findings += brief.findings.length;
    return { ...base, ok: true, ms, ...brief };
  }));
  return { question: plan.question, engines, mode, breadth, perEngine, briefs };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const args = [...argv];
  const flag = (name) => { const i = args.indexOf(name); if (i === -1) return false; args.splice(i, 1); return true; };
  const take = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) return null;
    args.splice(i, 2);
    return v;
  };
  const sensitive = flag("--sensitive");
  const vals = { plan: take("--plan"), engines: take("--engines"), mode: take("--mode"), breadth: take("--breadth"), timeout: take("--timeout") };
  const missing = Object.entries(vals).find(([, v]) => v === null);
  if (missing) return { ok: false, error: `missing value for --${missing[0]}\n${USAGE}` };
  const [cmd, ...rest] = args;
  if (rest.length) return { ok: false, error: `unexpected arguments: ${rest.join(" ")}\n${USAGE}` };
  if (cmd === "engines") return { ok: true, value: { cmd } };
  if (cmd !== "run" || !vals.plan) return { ok: false, error: USAGE };
  const mode = vals.mode ?? "rotate";
  if (!["rotate", "all"].includes(mode)) return { ok: false, error: `--mode must be rotate or all, got '${mode}'` };
  const breadth = vals.breadth === undefined ? 1 : Number(vals.breadth);
  if (!Number.isInteger(breadth) || breadth < 1 || breadth > LENSES.length) return { ok: false, error: `--breadth must be an integer 1-${LENSES.length}` };
  const timeoutSec = vals.timeout === undefined ? 600 : Number(vals.timeout);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) return { ok: false, error: "--timeout must be a positive number of seconds" };
  const engines = (vals.engines ?? "claude").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return { ok: true, value: { cmd, planPath: vals.plan, engines, mode, breadth, timeoutSec, sensitive } };
}

export function loadPlan(path) {
  let plan;
  try { plan = JSON.parse(readFileSync(path, "utf8")); } catch (e) { return { ok: false, error: `cannot read plan ${path}: ${String(e?.message ?? e)}` }; }
  if (!plan?.question || !Array.isArray(plan.angles) || !plan.angles.length || !plan.angles.every((a) => a?.label && a?.query)) {
    return { ok: false, error: "plan needs a question and a non-empty angles array of {label, query}" };
  }
  return { ok: true, plan };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { console.error(parsed.error); return 2; }
  const available = detectEngines(env);
  if (parsed.value.cmd === "engines") {
    console.log(JSON.stringify({ available: ENGINES.filter((e) => available.has(e)), missing: ENGINES.filter((e) => !available.has(e)) }));
    return 0;
  }
  const { planPath, engines: requested, mode, breadth, timeoutSec, sensitive: sensitiveFlag } = parsed.value;
  const loaded = loadPlan(planPath);
  if (!loaded.ok) { console.error(loaded.error); return 2; }
  const plan = { ...loaded.plan, sensitive: sensitiveFlag || loaded.plan.sensitive === true };
  const resolved = resolveEngines(requested, available, { sensitive: plan.sensitive });
  if (!resolved.ok) { console.error(resolved.error); return 2; }
  const out = await runResearch(plan, { engines: resolved.engines, mode, breadth, timeoutSec, env });
  console.log(JSON.stringify({ ...out, warnings: resolved.warnings }, null, 1));
  return out.briefs.some((b) => b.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.once(sig, () => { reapAllSeats(); process.exit(code); });
  }
  process.exitCode = await main();
}
