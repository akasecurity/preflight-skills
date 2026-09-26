import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LENSES as ENGINE_LENSES, ENGINES as ENGINE_LIST, ALL_ENGINES as ENGINE_ALL } from "../scripts/research.mjs";

// The workflow is a Claude Code Workflow script: plain JS with top-level await/return and the
// agent/parallel/phase/log globals. Run it here with those globals mocked.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "workflows", "secure-research-workflow.js"), "utf8").replace(/^export const meta/m, "const meta");
const AsyncFunction = (async () => {}).constructor;
const body = new AsyncFunction("args", "agent", "parallel", "phase", "log", src);

async function runWorkflow(args, { sensitivity = "normal", fail = () => false } = {}) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, o) => {
    calls.push({ label: o.label, model: o.model, prompt });
    if (o.label === "scope") return { question: "q", summary: "s", complexity: "moderate", sensitivity, angles: [1, 2, 3].map((i) => ({ label: `A${i}`, query: `q${i}` })) };
    if (o.label === "gap-check") return { sufficient: true, gaps: [], followUpAngles: [] };
    if (o.phase === "Research") {
      if (fail(o.label)) return { angleLabel: "x", findings: [], coverageNote: "ENGINE_FAILED: grok auth/credit failure: 402" };
      return { angleLabel: "x", coverageNote: "ok", findings: [{ claim: `c ${o.label}`, confidence: "high", sourceUrl: `https://e.example/${o.label}`, quote: "q" }] };
    }
    return { summary: "S", findings: [{ claim: "c", confidence: "high", sources: ["u"], evidence: "e" }], caveats: "" };
  };
  const parallel = (fns) => Promise.all(fns.map((f) => f()));
  const result = await body(args, agent, parallel, () => {}, (m) => logs.push(m));
  return { result, calls, logs, research: calls.filter((c) => c.label.startsWith("research")) };
}

test("workflow lenses match the engine's, so a lens means the same on both paths", () => {
  const m = src.match(/const LENSES = (\[[\s\S]*?\n\])/);
  assert.deepEqual(new Function(`return ${m[1]}`)(), ENGINE_LENSES);
});

test("default run: Claude-native researchers only, no forwarder", async () => {
  const { research, result } = await runWorkflow("question");
  assert.equal(research.length, 3);
  assert.ok(research.every((c) => c.prompt.startsWith("## Researcher")));
  assert.deepEqual(result.stats.engines, ["claude"]);
});

test("workflow engine lists match the engine's (all excludes grok on both paths)", () => {
  const grab = (name) => new Function(`return ${src.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1]}`)();
  assert.deepEqual(grab("ENGINES"), ENGINE_LIST);
  assert.deepEqual(grab("ALL_ENGINES"), ENGINE_ALL);
});

test("rotate over all engines: searxng and CLI engines go through research.mjs with a valid one-angle plan", async () => {
  const { research } = await runWorkflow({ question: "What trackers exist?", engines: "all", enginePath: "/x/research.mjs" });
  assert.deepEqual(research.map((c) => c.label), ["research:A1@claude", "research:A2@searxng", "research:A3@codex"]);
  assert.match(research[0].prompt, /^## Researcher/);
  for (const fwd of research.slice(1)) {
    assert.equal(fwd.model, "haiku");
    assert.match(fwd.prompt, /R='\/x\/research\.mjs'/);
  }
  assert.match(research[1].prompt, /--engines 'searxng'/);
  assert.doesNotMatch(research[1].prompt, /mcp__searxng/, "searxng is the engine's raw-snippet path, not an MCP researcher");
  const plan = JSON.parse(research[2].prompt.match(/<<'SECURE_RESEARCH_PLAN_END'\n(.*)\nSECURE_RESEARCH_PLAN_END/)[1]);
  assert.deepEqual([plan.question, plan.angles[0].label, plan.angles[0].query], ["What trackers exist?", "A3", "q3"]);
});

test("tuned engines: claude:sonnet sets the native researcher model, codex:<model> passes through quoted", async () => {
  const { research } = await runWorkflow({ question: "q", engines: ["claude:sonnet", "codex:gpt-6-luna@low"], enginePath: "/x/r.mjs" });
  assert.equal(research[0].model, "sonnet");
  assert.match(research[1].prompt, /--engines 'codex:gpt-6-luna@low'/);
});

test("enginePath and searxngUrl are single-quoted, so the shell expands nothing in them", async () => {
  const { research } = await runWorkflow({ question: "q", engines: ["searxng"], enginePath: "/tmp/$(touch pwned)/r.mjs", searxngUrl: "https://s.example/'x" });
  assert.match(research[0].prompt, /R='\/tmp\/\$\(touch pwned\)\/r\.mjs'/);
  assert.match(research[0].prompt, /SEARXNG_URL='https:\/\/s\.example\/'\\''x' node/);
});

test("default engine location: the preflight marketplace's preflight plugin, highest version", async () => {
  const { research } = await runWorkflow({ question: "q", engines: ["agy"] });
  assert.match(research[0].prompt, /plugins\/cache\/\{akasecurity,preflight\}\/preflight\/\*\/scripts\/research\.mjs/);
  assert.match(research[0].prompt, /\| sort -V \| tail -1 \| cut -f2-/);
});

test("engineMode all + an ENGINE_FAILED engine: counted as failed, run continues", async () => {
  const { result, logs } = await runWorkflow({ question: "q", engines: ["codex", "grok"], engineMode: "all" }, { fail: (l) => l.includes("@grok") });
  assert.deepEqual(result.stats.perEngine.grok, { researchers: 3, findings: 0, failed: 3 });
  assert.equal(result.stats.perEngine.codex.findings, 3);
  assert.ok(logs.some((l) => /ENGINE_FAILED/.test(l)));
});

test("sensitive topic: gated first, then searxng only through the engine with --sensitive (fails closed)", async () => {
  const gated = await runWorkflow({ question: "q", engines: ["codex"] }, { sensitivity: "sensitive" });
  assert.equal(gated.result.status, "awaiting-confirmation");
  assert.match(gated.result.note, /FULL question/);
  assert.equal(gated.research.length, 0);
  const ran = await runWorkflow({ question: "q", engines: ["codex", "agy"], sensitiveConfirmed: true, enginePath: "/x/r.mjs" }, { sensitivity: "sensitive" });
  assert.ok(ran.research.length > 0);
  assert.ok(ran.research.every((c) => /--engines 'searxng' --sensitive/.test(c.prompt)));
});

test("engine failures are returned, not just logged", async () => {
  const { result } = await runWorkflow({ question: "q", engines: ["grok"] }, { fail: () => true });
  assert.equal(result.engineFailures.length, 3);
  assert.match(result.engineFailures[0].reason, /402/);
  assert.match(result.summary, /FAILED/);
});

test("maxAngles is clamped to at least one angle", async () => {
  const { research } = await runWorkflow({ question: "q", maxAngles: 0 });
  assert.equal(research.length, 1);
});

test("unknown engine is rejected before any agent runs", async () => {
  const { result, calls } = await runWorkflow({ question: "q", engines: ["claude", "bing"] });
  assert.match(result.error, /Unknown engine\(s\): bing/);
  assert.equal(calls.length, 0);
});
