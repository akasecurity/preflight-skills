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
       research.mjs run --plan <plan.json> [--engines e1,e2|all] [--mode rotate|all] [--breadth <n>] [--sensitive] [--timeout <sec>] [--concurrency <n>]
engines: claude · codex · agy · grok (model CLIs, each runs its own web search) · searxng (needs SEARXNG_URL)
         a model CLI takes an optional tune, <engine>:<model>[@<effort>], e.g. claude:sonnet or codex:gpt-6-luna@low
plan.json: {"question":"…","angles":[{"label":"…","query":"…","rationale":"…"}],"alreadyCovered":["host", …],"sensitive":false,"cursor":0}
"all" = claude, searxng, codex, agy; grok runs only when named (its tool policy is unverified)`;

export const ENGINES = ["claude", "searxng", "codex", "grok", "agy"];
// "all" expands to these. grok is left out on purpose: it has no read-only sandbox or tool
// allow-list we could verify, so it runs only when named explicitly.
export const ALL_ENGINES = ["claude", "searxng", "codex", "agy"];
export const DEFAULT_CONCURRENCY = 6;
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
// What each binding restricts, stated plainly: claude is limited to WebSearch/WebFetch; codex runs in
// its read-only sandbox, which still allows file READS anywhere the user can read; agy runs sandboxed
// with auto-approve; grok has no tool restriction we could verify. Every CLI runs in an empty temp
// directory, which keeps the caller's repo out of reach by default but is not a filesystem jail.
// Every CLI binding is read-only apart from web access. packetVia "stdin" pipes the prompt;
// "arg" passes the whole prompt as the final argument. agy and grok need "arg": headless agy
// auto-denies the read_file permission a temp-file packet would need, and prints nothing.
// An engine spec is "<engine>[:<model>[@<effort>]]", e.g. claude:sonnet or codex:gpt-6-luna@low, so one
// run can compare models on the same angles. A bare engine takes the CLI's default model (claude: haiku).
export function parseEngineSpec(spec) {
  const [name, tune = ""] = String(spec).trim().split(/:(.*)/s);
  const [model = "", effort = ""] = tune.split("@");
  return { id: String(spec).trim(), name: name.toLowerCase(), model, effort };
}

export function bindingFor(engine, timeoutSec, { model = "", effort = "" } = {}) {
  if (engine === "claude") {
    // JSON output carries the run's cost. --strict-mcp-config and empty --setting-sources keep the
    // user's MCP servers, hooks and settings out of a researcher that reads untrusted web pages.
    return { packetVia: "stdin", output: "claude-json", argv: ["claude", "-p", "--model", model || "haiku", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch", "WebFetch",
      "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--output-format", "json"] };
  }
  if (engine === "codex") {
    const argv = ["codex", "--search", "exec", "--skip-git-repo-check", "--sandbox", "read-only"];
    if (model) argv.push("-c", `model=${model}`);
    if (effort) argv.push("-c", `model_reasoning_effort=${effort}`);
    return { packetVia: "stdin", output: "text", argv: [...argv, "-"] };
  }
  if (engine === "agy") {
    // Headless agy auto-denies any tool that needs a permission prompt, including read_url, and a
    // single denial ends the turn with no output. Its allow-rules are per-domain (read_url(<domain>))
    // and live in the user's global settings, which don't fit research across arbitrary sites. So
    // agy runs with auto-approve, but inside --sandbox (restricted terminal) and an empty throwaway
    // workspace (see runResearch).
    const argv = ["agy", "--sandbox", "--dangerously-skip-permissions", "--print-timeout", `${timeoutSec}s`];
    if (model) argv.push("--model", model);
    if (effort) argv.push("--effort", effort);
    return { packetVia: "arg", output: "text", argv: [...argv, "-p"] };
  }
  if (engine === "grok") {
    // Unverified: grok's headless tool policy. Kept out of "all" (see ALL_ENGINES).
    const argv = ["grok"];
    if (model) argv.push("-m", model);
    if (effort) argv.push("--reasoning-effort", effort);
    return { packetVia: "arg", output: "text", argv: [...argv, "-p"] };
  }
  return undefined;
}

// The answer text plus whatever usage the CLI reports: claude's JSON carries total_cost_usd,
// codex prints "tokens used N" on stderr. Absent usage stays absent, never a guessed number.
export function readOutput(binding, result) {
  if (binding.output === "claude-json") {
    try {
      const j = JSON.parse(result.stdout);
      return { text: String(j.result ?? ""), usage: { usd: Number(j.total_cost_usd) || 0 }, isError: j.is_error === true };
    } catch { return { text: result.stdout, usage: {} }; }
  }
  const m = result.stderr.match(/tokens used\s*\n?\s*([\d,]+)/i);
  return { text: result.stdout, usage: m ? { tokens: Number(m[1].replace(/,/g, "")) } : {} };
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

// A model may echo the contract example or print a draft before its answer, which leaves more than
// one object with a findings key. The last one is the answer.
export function extractBrief(text) {
  const direct = extractJson(text, "findings");
  if (direct) return direct;
  for (const marker of ['{"coverageNote"', '{"findings"']) {
    const i = text.lastIndexOf(marker);
    if (i !== -1) { const o = extractJson(text.slice(i), "findings"); if (o) return o; }
  }
  return undefined;
}

// A CLI that answered with a parseable brief succeeded, whatever its stderr says. Otherwise name
// the failure, singling out credit/auth problems so the caller can tell "top up" from "broken".
const AUTH_RE = /\b402\b|\b401\b|\b403\b|\b429\b|balance exhausted|credit balance|quota|usage limit|rate limit|unauthori[sz]ed|not logged in|login required/i;
export function failureReason(engine, result, brief) {
  if (brief) return undefined;
  // Model prose can mention "quota" or "429" legitimately, so stdout counts only when the CLI failed.
  const text = result.outcome === "error" ? `${result.stdout}\n${result.stderr}` : result.stderr;
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
  const wanted = requested.includes("all") ? [...new Set([...ALL_ENGINES, ...requested.filter((e) => e !== "all")])] : requested;
  const nameOf = (e) => parseEngineSpec(e).name;
  const unknown = wanted.filter((e) => !ENGINES.includes(nameOf(e)));
  if (unknown.length) return { ok: false, error: `unknown engine(s): ${unknown.join(", ")}` };
  if (sensitive) {
    if (!available.has("searxng")) return { ok: false, error: "sensitive topic: only the searxng engine is allowed, and SEARXNG_URL is not set" };
    if (wanted.some((e) => e !== "searxng")) warnings.push(`sensitive topic: ran on searxng only (requested ${wanted.join(",")})`);
    return { ok: true, engines: ["searxng"], warnings };
  }
  const usable = [...new Set(wanted)].filter((e) => {
    const name = nameOf(e);
    if (name === "searxng" && e !== "searxng") { warnings.push(`${e}: searxng takes no model; using searxng`); return false; }
    if (available.has(name)) return true;
    warnings.push(name === "searxng" ? "searxng skipped: SEARXNG_URL is not set" : `${e} skipped: '${CLI_BIN[name]}' not found on PATH`);
    return false;
  });
  if (!usable.length) return { ok: false, error: `none of the requested engines is available (${wanted.join(", ")})` };
  return { ok: true, engines: usable, warnings };
}

// ── run ─────────────────────────────────────────────────────────────────────
// Runs fn over items with at most `limit` in flight, keeping result order.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export async function runResearch(plan, { engines, mode = "rotate", breadth = 1, timeoutSec = 600, concurrency = DEFAULT_CONCURRENCY, env = process.env, fetchImpl, cwd } = {}) {
  // plan.cursor continues a previous run's rotation, so a follow-up wave doesn't restart on engine #0.
  const { jobs, cursor: nextCursor } = assignJobs(plan.angles, engines, { mode, breadth, cursor: Number.isInteger(plan.cursor) ? plan.cursor : 0 });
  const perEngine = Object.fromEntries(engines.map((e) => [e, { researchers: 0, findings: 0, failed: 0 }]));
  const briefs = await pool(jobs, concurrency, async (job) => {
    const stats = perEngine[job.engine];
    stats.researchers++;
    const base = { angle: job.angle.label, engine: job.engine, lens: job.lens };
    let brief, failure, ms, usage;
    if (job.engine === "searxng") {
      ({ brief, failure, ms } = await runSearxng(job.angle, { baseUrl: env.SEARXNG_URL, timeoutMs: Math.min(timeoutSec, 120) * 1000, ...(fetchImpl ? { fetchImpl } : {}) }));
    } else {
      // An angle may carry its own lens (the Claude workflow adapter sends one angle per call).
      const lens = job.lens > 0 ? LENSES[job.lens % LENSES.length] : (job.angle.lens ?? "");
      const prompt = researcherPrompt(plan, job.angle, { lens, alreadyCovered: plan.alreadyCovered ?? [] });
      const spec = parseEngineSpec(job.engine);
      const b = bindingFor(spec.name, timeoutSec, spec);
      // runSeat pipes brief+contract+packet on stdin. For an "arg" engine the same text also rides
      // as the final argument, which is what the CLI actually reads.
      const seat = { ...b, packetVia: "stdin", argv: b.packetVia === "arg" ? [...b.argv, `${prompt}\n\n${BRIEF_CONTRACT}`] : b.argv, brief: prompt, contract: BRIEF_CONTRACT };
      // Each CLI runs in its own empty directory, never the caller's repo: web research needs no
      // files, and relative paths from a prompt injection in a fetched page resolve to nothing.
      // This is not a jail (see the binding notes above).
      const jobDir = cwd ?? mkdtempSync(join(tmpdir(), "research-"));
      const result = await runSeat(seat, "", timeoutSec * 1000, { cwd: jobDir });
      if (!cwd) rmSync(jobDir, { recursive: true, force: true });
      ms = result.ms;
      const out = readOutput(b, result);
      usage = out.usage;
      brief = out.isError ? undefined : normalizeBrief(extractBrief(out.text));
      failure = failureReason(job.engine, { ...result, stdout: out.text }, brief);
    }
    if (usage?.usd) stats.usd = (stats.usd ?? 0) + usage.usd;
    if (usage?.tokens) stats.tokens = (stats.tokens ?? 0) + usage.tokens;
    if (failure) { stats.failed++; return { ...base, ok: false, failure, ms, ...(usage ? { usage } : {}) }; }
    stats.findings += brief.findings.length;
    return { ...base, ok: true, ms, ...(usage ? { usage } : {}), ...brief };
  });
  return { question: plan.question, engines, mode, breadth, nextCursor, perEngine, briefs };
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
  const vals = { plan: take("--plan"), engines: take("--engines"), mode: take("--mode"), breadth: take("--breadth"), timeout: take("--timeout"), concurrency: take("--concurrency") };
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
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0 || timeoutSec > 3600) return { ok: false, error: "--timeout must be 1-3600 seconds" };
  const concurrency = vals.concurrency === undefined ? DEFAULT_CONCURRENCY : Number(vals.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) return { ok: false, error: "--concurrency must be an integer 1-32" };
  const engines = (vals.engines ?? "claude").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return { ok: true, value: { cmd, planPath: vals.plan, engines, mode, breadth, timeoutSec, concurrency, sensitive } };
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
  const { planPath, engines: requested, mode, breadth, timeoutSec, concurrency, sensitive: sensitiveFlag } = parsed.value;
  const loaded = loadPlan(planPath);
  if (!loaded.ok) { console.error(loaded.error); return 2; }
  const plan = { ...loaded.plan, sensitive: sensitiveFlag || loaded.plan.sensitive === true };
  const resolved = resolveEngines(requested, available, { sensitive: plan.sensitive });
  if (!resolved.ok) { console.error(resolved.error); return 2; }
  const out = await runResearch(plan, { engines: resolved.engines, mode, breadth, timeoutSec, concurrency, env });
  console.log(JSON.stringify({ ...out, warnings: resolved.warnings }, null, 1));
  return out.briefs.some((b) => b.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.once(sig, () => { reapAllSeats(); process.exit(code); });
  }
  process.exitCode = await main();
}
