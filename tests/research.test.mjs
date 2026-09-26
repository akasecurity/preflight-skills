import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assignJobs, resolveEngines, parseEngineSpec, bindingFor, readOutput, normalizeBrief, failureReason, runSearxng, researcherPrompt, parseArgs, detectEngines, runResearch,
} from "../scripts/research.mjs";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "research.mjs");
const stubs = join(here, "stubs");
// Hermetic PATH: only the stub CLIs plus node itself.
const stubEnv = (extra = {}) => ({ ...process.env, PATH: `${stubs}${delimiter}${dirname(process.execPath)}`, SEARXNG_URL: "", ...extra });
const angles = [{ label: "A1", query: "q1" }, { label: "A2", query: "q2" }, { label: "A3", query: "q3" }];
const plan = { question: "Which self-hosted price trackers exist?", angles };

function planFile(p = plan) {
  const f = join(mkdtempSync(join(tmpdir(), "rplan-")), "plan.json");
  writeFileSync(f, JSON.stringify(p));
  return f;
}

test("assignJobs rotate: one engine per slot, round-robin, cursor carries over", () => {
  const { jobs, cursor } = assignJobs(angles, ["claude", "codex"], { mode: "rotate" });
  assert.deepEqual(jobs.map((j) => `${j.angle.label}@${j.engine}`), ["A1@claude", "A2@codex", "A3@claude"]);
  assert.equal(cursor, 3);
  const next = assignJobs([angles[0]], ["claude", "codex"], { cursor });
  assert.equal(next.jobs[0].engine, "codex");
});

test("assignJobs all + breadth: every slot on every engine, lenses numbered per angle", () => {
  const { jobs } = assignJobs([angles[0]], ["claude", "agy"], { mode: "all", breadth: 2 });
  assert.deepEqual(jobs.map((j) => `${j.lens}@${j.engine}`), ["0@claude", "0@agy", "1@claude", "1@agy"]);
});

test("resolveEngines: sensitive collapses to searxng, and refuses without SEARXNG_URL", () => {
  const avail = new Set(["claude", "codex", "searxng"]);
  const r = resolveEngines(["codex", "claude"], avail, { sensitive: true });
  assert.deepEqual(r.engines, ["searxng"]);
  assert.match(r.warnings[0], /searxng only/);
  const refused = resolveEngines(["codex"], new Set(["codex"]), { sensitive: true });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /SEARXNG_URL/);
});

test("resolveEngines: 'all' expands, unavailable engines are skipped with a warning, unknown is an error", () => {
  const r = resolveEngines(["all"], new Set(["claude", "agy", "grok"]));
  assert.deepEqual(r.engines, ["claude", "agy"], "all leaves out grok, whose tool policy is unverified");
  assert.ok(r.warnings.some((w) => /SEARXNG_URL/.test(w)));
  assert.deepEqual(resolveEngines(["all", "grok"], new Set(["claude", "grok"])).engines, ["claude", "grok"]);
  assert.equal(resolveEngines(["bing"], new Set()).ok, false);
  assert.equal(resolveEngines(["grok"], new Set(["claude"])).ok, false);
});

test("normalizeBrief drops findings without an http source or quote and clamps enums", () => {
  const b = normalizeBrief({ coverageNote: "n", findings: [
    { claim: "ok", confidence: "sure", sourceUrl: "https://a.example", quote: "q", importance: "huge" },
    { claim: "no url", sourceUrl: "", quote: "q" },
    { claim: "bad scheme", sourceUrl: "file:///etc/passwd", quote: "q" },
    { claim: "no quote", sourceUrl: "https://b.example" },
  ] });
  assert.equal(b.findings.length, 1);
  assert.deepEqual([b.findings[0].confidence, b.findings[0].importance], ["low", "supporting"]);
  assert.equal(normalizeBrief({ verdict: "approve" }), undefined);
});

test("failureReason: a parsed brief wins over scary stderr; 402 is named as a credit failure", () => {
  assert.equal(failureReason("codex", { outcome: "ok", stdout: "", stderr: "rate limit" }, { findings: [] }), undefined);
  assert.match(failureReason("grok", { outcome: "error", code: 1, stdout: "status 402 Payment Required", stderr: "" }), /credit failure: 402/);
  assert.equal(failureReason("agy", { outcome: "timeout", stdout: "", stderr: "" }), "agy timed out");
  assert.match(failureReason("codex", { outcome: "ok", stdout: "no json here", stderr: "" }), /no parseable brief/);
});

test("runSearxng: raw snippets become low-confidence findings, deduped by URL, no model involved", async () => {
  let asked;
  const fetchImpl = async (url) => { asked = url; return { ok: true, json: async () => ({ results: [
    { url: "https://x.example/1", title: "One", content: "snippet one" },
    { url: "https://x.example/1", title: "Dup", content: "dup" },
    { url: "https://x.example/2", title: "No content" },
  ] }) }; };
  const r = await runSearxng({ label: "A", query: "price tracker" }, { baseUrl: "https://searx.example/", fetchImpl });
  assert.equal(asked, "https://searx.example/search?format=json&q=price%20tracker");
  assert.equal(r.brief.findings.length, 1);
  assert.deepEqual([r.brief.findings[0].confidence, r.brief.findings[0].raw], ["low", true]);
  const down = await runSearxng({ label: "A", query: "q" }, { baseUrl: "https://s", fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.equal(down.failure, "searxng HTTP 502");
});

test("researcherPrompt carries the question, angle, lens and the sensitive-topic guard", () => {
  const p = researcherPrompt({ ...plan, sensitive: true }, angles[0], { lens: "LENS", alreadyCovered: ["a.example"] });
  assert.match(p, /=== RESEARCH BRIEF ===/);
  assert.match(p, /Which self-hosted price trackers exist\?/);
  assert.match(p, /Starting query: q1/);
  assert.match(p, /Lens: LENS/);
  assert.match(p, /privacy-sensitive/);
  assert.match(p, /a\.example/);
});

test("parseArgs validates mode, breadth and missing values", () => {
  assert.equal(parseArgs(["run"]).ok, false);
  assert.equal(parseArgs(["run", "--plan", "p", "--mode", "x"]).ok, false);
  assert.equal(parseArgs(["run", "--plan", "p", "--breadth", "0"]).ok, false);
  assert.equal(parseArgs(["run", "--plan"]).ok, false);
  const ok = parseArgs(["run", "--plan", "p", "--engines", "codex, AGY", "--sensitive"]);
  assert.deepEqual([ok.value.engines, ok.value.sensitive], [["codex", "agy"], true]);
});

test("detectEngines finds stub CLIs on PATH and searxng only when SEARXNG_URL is set", () => {
  const found = detectEngines({ PATH: stubs, SEARXNG_URL: "" });
  assert.deepEqual([...found].sort(), ["agy", "claude", "codex", "grok"]);
  assert.ok(detectEngines({ PATH: "", SEARXNG_URL: "https://s" }).has("searxng"));
});

test("runResearch over stub CLIs: stdin and file engines parse, grok's 402 is a counted failure", async () => {
  // runSeat spawns with the parent's environment, so point PATH at the stubs for this test only.
  const savedPath = process.env.PATH;
  process.env.PATH = stubEnv().PATH;
  let out;
  try { out = await runResearch(plan, { engines: ["claude", "agy", "grok"], mode: "rotate", timeoutSec: 20, env: stubEnv() }); }
  finally { process.env.PATH = savedPath; }
  const byEngine = Object.fromEntries(out.briefs.map((b) => [b.engine, b]));
  assert.equal(byEngine.claude.ok, true);
  assert.equal(byEngine.claude.findings.length, 1, "the unsourced stub finding is dropped");
  assert.equal(byEngine.agy.findings[0].claim, "e2e agy claim");
  assert.equal(byEngine.grok.ok, false);
  assert.match(byEngine.grok.failure, /402/);
  assert.deepEqual(out.perEngine.grok, { researchers: 1, findings: 0, failed: 1 });
});

test("e2e CLI: engines lists availability; run prints JSON and exits 0 when any brief lands", async () => {
  const eng = JSON.parse((await run("node", [script, "engines"], { env: stubEnv() })).stdout);
  assert.deepEqual(eng.missing, ["searxng"]);
  const { stdout } = await run("node", [script, "run", "--plan", planFile(), "--engines", "codex,grok,searxng", "--timeout", "20"], { env: stubEnv() });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.engines, ["codex", "grok"]);
  assert.ok(out.warnings.some((w) => /searxng skipped/.test(w)));
  assert.ok(out.briefs.some((b) => b.engine === "codex" && b.ok));
});

test("e2e CLI: a sensitive plan without SEARXNG_URL exits 2 and never runs a third-party CLI", async () => {
  await assert.rejects(
    run("node", [script, "run", "--plan", planFile({ ...plan, sensitive: true }), "--engines", "codex"], { env: stubEnv() }),
    (e) => e.code === 2 && /SEARXNG_URL/.test(e.stderr),
  );
});

test("e2e CLI: every engine failing exits 1", async () => {
  await assert.rejects(
    run("node", [script, "run", "--plan", planFile(), "--engines", "grok", "--timeout", "20"], { env: stubEnv() }),
    (e) => e.code === 1,
  );
});

test("engine specs carry a model and effort into the CLI argv", () => {
  assert.deepEqual(parseEngineSpec("codex:gpt-6-luna@low"), { id: "codex:gpt-6-luna@low", name: "codex", model: "gpt-6-luna", effort: "low" });
  assert.deepEqual(parseEngineSpec("claude"), { id: "claude", name: "claude", model: "", effort: "" });
  const codex = bindingFor("codex", 60, parseEngineSpec("codex:gpt-6-luna@low")).argv;
  assert.ok(codex.includes("model=gpt-6-luna") && codex.includes("model_reasoning_effort=low"));
  const claude = bindingFor("claude", 60, parseEngineSpec("claude:sonnet")).argv;
  assert.equal(claude[claude.indexOf("--model") + 1], "sonnet");
  assert.ok(claude.includes("--strict-mcp-config"));
  assert.equal(bindingFor("claude", 60).argv[bindingFor("claude", 60).argv.indexOf("--model") + 1], "haiku");
});

test("resolveEngines keeps tuned specs of the same engine side by side", () => {
  const r = resolveEngines(["claude:haiku", "claude:sonnet", "codex:gpt-6-luna"], new Set(["claude", "codex"]));
  assert.deepEqual(r.engines, ["claude:haiku", "claude:sonnet", "codex:gpt-6-luna"]);
  assert.equal(resolveEngines(["bing:x"], new Set()).ok, false);
});

test("readOutput: claude JSON yields the answer and its cost; codex stderr yields tokens", () => {
  const c = readOutput({ output: "claude-json" }, { stdout: JSON.stringify({ result: "{\"findings\":[]}", total_cost_usd: 0.012 }), stderr: "" });
  assert.deepEqual([c.text, c.usage.usd], ['{"findings":[]}', 0.012]);
  const x = readOutput({ output: "text" }, { stdout: "answer", stderr: "tokens used\n12,345\n" });
  assert.deepEqual([x.text, x.usage.tokens], ["answer", 12345]);
});
