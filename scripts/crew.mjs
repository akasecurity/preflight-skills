#!/usr/bin/env node
// crew.mjs — an independent multi-model review crew: two blind parallel reads
// of a diff or design doc by different model families, then an independent
// judge that filters false positives. REPORT-ONLY: prints a report, takes no
// action, writes nothing into the reviewed repo.
import { pathToFileURL } from "node:url";
import { accessSync, statSync, constants as fsConstants, mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, delimiter } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { createHash } from "node:crypto";

export const USAGE = `usage: crew.mjs review <git-range>  [--item <label>] [--read family[:tune] ...] [--judge family[:model]] [--timeout <sec>]
       crew.mjs consult <file>      [same flags]
       crew.mjs biascheck <file>    [--reads <n>] [--read family[:tune]] [--item <label>] [--timeout <sec>]
families: claude · openai (codex CLI) · google (agy CLI)`;

// ── roles, contracts, family bindings ───────────────────────────────────────
export const FAMILIES = { claude: "claude", openai: "codex", google: "agy" };

export const RECALL_BRIEF = `You are one of two independent reviewers running the RECALL-tuned read of a review panel.
Surface everything suspicious: possible bugs, smells, missing pieces, risky assumptions. Err toward
reporting — false positives are acceptable and expected; an independent judge filters them. Every
finding cites file:line (or a doc section for a design doc). You may freely explore the repository
you are invoked in to build judgment context; the packet below is the shared ground truth.`;

export const PRECISION_BRIEF = `You are one of two independent reviewers running the PRECISION-tuned read of a review panel.
Report only what you can ground: each finding must be reproducible or citable from the packet and
repository; drop confident-but-uncited claims. A short list of hard findings beats a long list of
maybes. You may freely explore the repository you are invoked in; the packet below is the shared
ground truth.`;

export const JUDGE_BRIEF = `You are the independent judge of a review panel. Two reviewers read the same packet blind and
their verbatim reads follow it. Form YOUR OWN opinion of the material first, then weigh their
findings: discard clear false positives, flag anything both missed. You are a judge, not a vote
counter — reviewer agreement does not bind you.`;

export const READ_CONTRACT = `Respond with a single JSON object and nothing else:
{"verdict":"approve"|"concerns","findings":[{"severity":"high"|"medium"|"low","ref":"<file:line or doc section>","issue":"<what is wrong>","evidence":"<optional grounding>"}]}
verdict "approve" with an empty findings array means you found nothing to report.`;

export const JUDGE_CONTRACT = `Respond with a single JSON object and nothing else:
{"verdict":"approve"|"revise"|"reject","convergence":"converged"|"diverged","rationale":"<your independent assessment>","discarded":["<finding you judged a false positive, and why>"],"systemic":["<pattern-level concern both reads missed>"]}`;

export const TELLS_READ_BRIEF = `You are scoring one piece of writing for how human- versus AI-authored it reads, using the corpus research in the packet as reference. Form your own judgment from the text and the research. A plain, terse, or non-native-English voice is not itself a tell.`;

export const TELLS_READ_CONTRACT = `Respond with a single JSON object and nothing else:
{"score":<0-100 integer, higher = reads more human-authored>,"reasoning":"<your assessment>","findings":[{"ref":"<quoted phrase>","tell":"<the tell>","fix":"<suggested fix>"}]}
findings is optional and may be empty; do not manufacture tells to fill it.`;

export function bindingFor(family, tune, role, timeoutSec) {
  if (family === "claude") {
    const model = tune || (role === "precision" ? "sonnet" : "opus");
    return {
      family, tune: model, packetVia: "stdin", readOnly: "allowed-tools (Read/Grep/Glob)",
      argv: ["claude", "-p", "--model", model, "--allowedTools", "Read", "Grep", "Glob"],
    };
  }
  if (family === "openai") {
    // tune is "effort" or "effort:model" — either half may be blank to take its role default.
    const [effortPart, modelPart] = (tune ?? "").split(":");
    const effort = effortPart || (role === "judge" ? "low" : "medium");
    const model = modelPart || (role === "judge" ? "gpt-5.6-sol" : "gpt-5.6-terra");
    return {
      family, tune: `${model}@${effort}`, packetVia: "stdin", readOnly: "sandbox read-only",
      argv: ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", `model=${model}`, "-c", `model_reasoning_effort=${effort}`, "-"],
    };
  }
  if (family === "google") {
    const argv = ["agy", "--sandbox", "--print-timeout", `${timeoutSec}s`];
    if (tune) argv.push("--model", tune);
    argv.push("-p"); // prompt text appended at spawn time (agy takes the prompt as an argument, not stdin)
    return { family, tune: tune || "default", packetVia: "file", readOnly: "sandbox (terminal restrictions — not strict read-only)", argv };
  }
  return undefined;
}

// ── seat detection & crew choice (stateless per run — nothing stored) ───────
export function detectFamilies(env = process.env) {
  const found = new Set();
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const [family, bin] of Object.entries(FAMILIES)) {
    for (const dir of dirs) {
      try {
        const p = join(dir, bin);
        accessSync(p, fsConstants.X_OK);
        if (!statSync(p).isFile()) continue;
        found.add(family);
        break;
      } catch { /* keep looking */ }
    }
  }
  return found;
}

const FAMILY_ORDER = ["claude", "openai", "google"];
const SOLO_TUNES = { claude: ["opus", "sonnet"], openai: ["high", "medium"], google: [undefined, undefined] };
const INSTALL_POINTERS = "no supported model CLI found on PATH — install one of: claude (Claude Code) · codex (OpenAI Codex CLI) · agy (Google Antigravity CLI)";

function parseSpec(spec) {
  const sep = spec.indexOf(":");
  return { family: sep === -1 ? spec : spec.slice(0, sep), tune: sep === -1 ? undefined : spec.slice(sep + 1) || undefined };
}

function seatText(role) {
  const brief = role === "recall" ? RECALL_BRIEF : role === "precision" ? PRECISION_BRIEF : JUDGE_BRIEF;
  return { brief, contract: role === "judge" ? JUDGE_CONTRACT : READ_CONTRACT };
}

export function chooseCrew(available, { readSpecs = [], judgeSpec, timeoutSec = 600 } = {}) {
  const mkSeat = (role, family, tune, flag) => {
    const b = bindingFor(family, tune, role, timeoutSec);
    if (!b) return { error: `unsupported ${flag} family '${family}' — families: ${FAMILY_ORDER.join(" · ")}` };
    if (!available.has(family)) return { error: `${flag} requested family '${family}' but its CLI ('${FAMILIES[family]}') is not on PATH` };
    return { seat: { role, ...seatText(role), ...b } };
  };

  let plan;
  if (readSpecs.length > 0) {
    plan = readSpecs.map(parseSpec).map((s, i) => ({ ...s, role: i === 0 ? "recall" : "precision" }));
  } else {
    const present = FAMILY_ORDER.filter((f) => available.has(f));
    if (present.length === 0) return { ok: false, exit: 1, error: INSTALL_POINTERS };
    plan = present.length >= 2
      ? [{ family: present[0], role: "recall" }, { family: present[1], role: "precision" }]
      : [{ family: present[0], tune: SOLO_TUNES[present[0]][0], role: "recall" }, { family: present[0], tune: SOLO_TUNES[present[0]][1], role: "precision" }];
  }
  const reads = [];
  for (const p of plan) {
    const r = mkSeat(p.role, p.family, p.tune, "--read");
    if (r.error) return { ok: false, exit: 1, error: r.error };
    reads.push(r.seat);
  }

  let judge, judgeFallback = false;
  if (judgeSpec) {
    const s = parseSpec(judgeSpec);
    const r = mkSeat("judge", s.family, s.tune, "--judge");
    if (r.error) return { ok: false, exit: 1, error: r.error };
    judge = r.seat;
  } else if (available.has("claude")) {
    judge = mkSeat("judge", "claude", "opus", "--judge").seat;
  } else {
    // available is non-empty here — both selection paths above returned earlier otherwise.
    const f = FAMILY_ORDER.find((x) => available.has(x));
    judge = mkSeat("judge", f, undefined, "--judge").seat;
    judgeFallback = true;
  }

  const warnings = [];
  if (readSpecs.length > 0 && readSpecs.length !== 2) {
    warnings.push(`--read given ${readSpecs.length} time(s) — the standard crew is two blind reads; this run uses ${readSpecs.length}`);
  }

  return { ok: true, value: { reads, judge, sameFamily: new Set(reads.map((s) => s.family)).size === 1, judgeFallback, warnings } };
}

// biascheck selection: N identical neutral reads of ONE model (default openai → gpt-5.6-terra@medium).
// No cross-family panel, no judge. A single --read spec overrides the model for all N.
export function chooseReads(available, { readSpec, reads = 3, timeoutSec = 600 } = {}) {
  const spec = readSpec ? parseSpec(readSpec) : { family: "openai", tune: undefined };
  const b = bindingFor(spec.family, spec.tune, "read", timeoutSec);
  if (!b) return { ok: false, exit: 1, error: `unsupported --read family '${spec.family}' — families: ${FAMILY_ORDER.join(" · ")}` };
  if (!available.has(spec.family)) {
    return { ok: false, exit: 1, error: `biascheck's default scorer is openai gpt-5.6-terra; the '${FAMILIES[spec.family]}' CLI is not on PATH — install it or pass --read <family>` };
  }
  const seats = Array.from({ length: reads }, (_, i) => ({ role: `read${i + 1}`, brief: TELLS_READ_BRIEF, contract: TELLS_READ_CONTRACT, ...b }));
  return { ok: true, value: { seats, model: `${spec.family}:${b.tune}`, reads } };
}

// ── tolerant JSON extraction ────────────────────────────────────────────────
// A model that wraps its JSON in prose still yields a record; a model that
// emits no JSON yields undefined, which the caller records as `skipped`.
function parseObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function scanBalancedObjects(text) {
  const objects = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; continue; }
    if (ch !== "}" || depth === 0) continue;
    depth--;
    if (depth !== 0 || start === -1) continue;
    const parsed = parseObject(text.slice(start, i + 1));
    if (parsed !== undefined) objects.push(parsed);
    start = -1;
  }
  return objects;
}

export function extractJson(text, discriminatingKey) {
  const whole = parseObject(text.trim());
  if (whole !== undefined) {
    if (discriminatingKey === undefined || Object.hasOwn(whole, discriminatingKey)) return whole;
    return undefined;
  }
  const objects = scanBalancedObjects(text);
  if (discriminatingKey === undefined) return objects[0];
  const matches = objects.filter((o) => Object.hasOwn(o, discriminatingKey));
  return matches.length === 1 ? matches[0] : undefined;
}

// ── bounded seat spawn ──────────────────────────────────────────────────────
// One child per model seat; SIGKILL at the deadline. A missed SLO is an
// outcome to report, never a number to silently raise.

// Kill the seat's whole process group (detached spawn makes the child a group leader),
// so model CLIs that fork grandchildren don't outlive a timeout. Never throws: if the
// group kill fails (already gone, platform quirk, no pid yet), fall back to the direct child.
export function killSeat(child, { kill = process.kill } = {}) {
  try {
    if (typeof child.pid === "number") { kill(-child.pid, "SIGKILL"); return; }
  } catch { /* fall through to single-child kill */ }
  try { child.kill("SIGKILL"); } catch { /* already gone */ }
}

// Every live seat child, so any exit path (timeout, signal, completion) can tear them all down.
// runSeat registers a child on spawn and removes it when the seat finishes.
export const liveSeats = new Set();

// Reap every still-running seat's process group — used by the SIGINT/SIGTERM handlers so an
// interactive Ctrl-C doesn't orphan the detached model CLIs (their own group won't get the signal).
export function reapAllSeats({ kill = process.kill } = {}) {
  for (const child of liveSeats) killSeat(child, { kill });
  liveSeats.clear();
}

export function runSeat(seat, packetBody, timeoutMs, { cwd = process.cwd(), clock = Date.now } = {}) {
  return new Promise((resolve) => {
    const started = clock();
    let out = "", errText = "", done = false;
    let timer;
    let packetDir; // set for file-packet seats; removed on success, kept on timeout/error
    let seatChild; // registered in liveSeats while running so any exit path can reap it
    const finish = (outcome, code = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (seatChild) liveSeats.delete(seatChild);
      if (outcome === "ok" && packetDir) { try { rmSync(packetDir, { recursive: true, force: true }); } catch { /* leave the artifact */ } }
      resolve({ outcome, code, ms: clock() - started, stdout: out, stderr: errText });
    };
    try {
      const argv = [...seat.argv];
      let stdinText;
      if (seat.packetVia === "file") {
        packetDir = mkdtempSync(join(tmpdir(), "crew-"));
        const packetPath = join(packetDir, "packet.md");
        writeFileSync(packetPath, packetBody);
        argv.push(`${seat.brief}\n\nYour ground-truth packet is the file ${packetPath} — read it fully first, then respond. ${seat.contract}`);
      } else {
        stdinText = `${seat.brief}\n\n${seat.contract}\n\n${packetBody}`;
      }

      const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ["pipe", "pipe", "pipe"], detached: true });
      seatChild = child;
      liveSeats.add(child);
      timer = setTimeout(() => {
        killSeat(child);
        finish("timeout");
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { errText += d; });
      child.on("error", (e) => { errText += String(e?.message ?? e); finish("error"); });
      child.on("close", (code) => finish(code === 0 ? "ok" : "error", code));
      child.stdin.on("error", () => { /* child exited before reading stdin — close() decides the outcome */ });
      if (stdinText !== undefined) child.stdin.write(stdinText);
      child.stdin.end();
    } catch (e) {
      // Never reject: a sync failure (fs error, malformed argv) is an error OUTCOME.
      errText += String(e?.message ?? e);
      finish("error");
    }
  });
}

// ── findings normalization ─────────────────────────────────────────────────
// Findings arrive from live model output and are not shape-guaranteed; normalize at the boundary
// so a partially-conformant model degrades to legible report lines, never "[undefined] undefined:".
const FINDING_SEVERITIES = new Set(["high", "medium", "low"]);
function normalizeFinding(f) {
  if (f === null || typeof f !== "object") return { severity: "unrated", ref: "unlocated", issue: String(f) };
  return {
    severity: FINDING_SEVERITIES.has(f.severity) ? f.severity : "unrated",
    ref: typeof f.ref === "string" && f.ref ? f.ref : "unlocated",
    issue: typeof f.issue === "string" && f.issue ? f.issue : JSON.stringify(f),
    ...(typeof f.evidence === "string" && f.evidence ? { evidence: f.evidence } : {}),
  };
}

// biascheck findings carry ref/tell/fix (not severity/issue/evidence). Normalize at the boundary.
export function normalizeTell(f) {
  if (f === null || typeof f !== "object") return { ref: "unlocated", tell: String(f) };
  return {
    ref: typeof f.ref === "string" && f.ref ? f.ref : "unlocated",
    tell: typeof f.tell === "string" && f.tell ? f.tell : JSON.stringify(f),
    ...(typeof f.fix === "string" && f.fix ? { fix: f.fix } : {}),
  };
}

// Median of a non-empty numeric array; mean of the two middles for even length.
export function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// ── crew orchestration ──────────────────────────────────────────────────────
// Two blind reads fan in PARALLEL with the identical packet; the judge runs
// after, over packet + verbatim reads. Code gathers; the JUDGE judges; the
// caller (a human reading the report) acts. Nothing here blocks anything.
const firstLine = (s) => String(s ?? "").trim().split("\n")[0] ?? "";

export async function runCrew(crew, packet, { cwd, timeoutMs, clock = Date.now } = {}) {
  const calls = [];
  const call = async (seat, body) => {
    const res = await runSeat(seat, body, timeoutMs, { cwd, clock });
    // calls is completion-ordered, not seat-ordered — do not index it positionally against crew.reads.
    calls.push({
      at: new Date(clock()).toISOString(), repo: cwd, cmd: packet.kind,
      role: seat.role, family: seat.family, model: seat.tune, ms: res.ms, outcome: res.outcome, readOnly: seat.readOnly,
    });
    return res;
  };

  const readResults = await Promise.all(crew.reads.map((seat) => call(seat, packet.body)));
  const reads = readResults.map((res, i) => {
    const seat = crew.reads[i];
    const base = { role: seat.role, family: seat.family, tune: seat.tune, ms: res.ms };
    if (res.outcome === "timeout") return { ...base, verdict: "skipped", findings: [], skipReason: `timeout after ${Math.round(res.ms / 1000)}s` };
    if (res.outcome === "error") return { ...base, verdict: "skipped", findings: [], skipReason: `cli error (exit ${res.code}): ${firstLine(res.stderr)}` };
    const parsed = extractJson(res.stdout, "findings");
    if (!parsed) return { ...base, verdict: "skipped", findings: [], skipReason: "no parsable JSON verdict in output" };
    return { ...base, verdict: parsed.verdict === "approve" ? "approve" : "concerns", findings: (Array.isArray(parsed.findings) ? parsed.findings : []).map(normalizeFinding) };
  });

  if (reads.every((r) => r.verdict === "skipped")) {
    return { reads, judge: { ok: false, error: "all reads skipped — nothing to judge" }, calls };
  }

  // Prompt-side key transform: embedded reads carry `readVerdict`, never `verdict`, so a judge
  // that echoes its input cannot create a second balanced object holding the discriminating key —
  // the response parse routes on structure, not on the model obeying "nothing else".
  const promptReads = reads.map(({ verdict, ...rest }) => ({ ...rest, readVerdict: verdict }));
  const judgeBody = `${packet.body}\n\n=== REVIEWER READS (blind at read time) ===\n${JSON.stringify(promptReads, null, 2)}`;
  const jres = await call(crew.judge, judgeBody);
  let judge;
  if (jres.outcome !== "ok") {
    judge = { ok: false, error: `judge ${jres.outcome}${jres.code != null ? ` (exit ${jres.code})` : ""}: ${firstLine(jres.stderr)}` };
  } else {
    const v = extractJson(jres.stdout, "verdict");
    judge = v
      ? { ok: true, value: { verdict: v.verdict, convergence: v.convergence, rationale: v.rationale, discarded: Array.isArray(v.discarded) ? v.discarded : [], systemic: Array.isArray(v.systemic) ? v.systemic : [] } }
      : { ok: false, error: "no parsable JSON verdict in judge output" };
  }
  return { reads, judge, calls };
}

// biascheck orchestration: N neutral reads fan out in PARALLEL over the identical packet; no judge.
// AUTHENTICITY is the median of the numeric scores; failed/unparseable reads are excluded (and printed).
export async function runBiascheck(seats, packet, { cwd, timeoutMs, clock = Date.now } = {}) {
  const calls = [];
  const results = await Promise.all(seats.map(async (seat) => {
    const res = await runSeat(seat, packet.body, timeoutMs, { cwd, clock });
    calls.push({
      at: new Date(clock()).toISOString(), repo: cwd, cmd: packet.kind,
      role: seat.role, family: seat.family, model: seat.tune, ms: res.ms, outcome: res.outcome, readOnly: seat.readOnly,
    });
    return { seat, res };
  }));
  const reads = results.map(({ seat, res }) => {
    const base = { role: seat.role, family: seat.family, tune: seat.tune, ms: res.ms };
    if (res.outcome === "timeout") return { ...base, findings: [], skipReason: `timeout after ${Math.round(res.ms / 1000)}s` };
    if (res.outcome === "error") return { ...base, findings: [], skipReason: `cli error (exit ${res.code}): ${firstLine(res.stderr)}` };
    const parsed = extractJson(res.stdout, "score");
    if (!parsed || typeof parsed.score !== "number") return { ...base, findings: [], skipReason: "no parsable score in output" };
    return { ...base, score: parsed.score, reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "", findings: (Array.isArray(parsed.findings) ? parsed.findings : []).map(normalizeTell) };
  });
  const scores = reads.filter((r) => typeof r.score === "number").map((r) => r.score);
  return {
    reads,
    authenticity: scores.length ? median(scores) : undefined,
    spread: scores.length ? [Math.min(...scores), Math.max(...scores)] : undefined,
    scored: scores.length,
    calls,
  };
}

// ── argument parsing ────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const args = [...argv];
  const warnings = [];
  let flagError;
  const take = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) {
      flagError = flagError ?? `missing value for ${name}`;
      args.splice(i, 1);
      return undefined;
    }
    args.splice(i, 2);
    return v;
  };
  const takeAll = (name) => {
    const out = [];
    for (;;) { const v = take(name); if (v === undefined) break; out.push(v); }
    return out;
  };
  const readSpecs = takeAll("--read");
  const judgeSpecs = takeAll("--judge");
  if (judgeSpecs.length > 1) warnings.push(`--judge given ${judgeSpecs.length} times but there is exactly one judge seat — only the last ('${judgeSpecs.at(-1)}') is honored`);
  const item = take("--item");
  const timeoutRaw = take("--timeout");
  if (flagError) return { ok: false, exit: 2, error: `${flagError}\n${USAGE}` };
  const timeoutSec = timeoutRaw === undefined ? 600 : Number(timeoutRaw);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) return { ok: false, exit: 2, error: `--timeout must be a positive number of seconds, got '${timeoutRaw}'\n${USAGE}` };
  const readsRaw = take("--reads");
  const reads = readsRaw === undefined ? 3 : Number(readsRaw);
  if (readsRaw !== undefined && (!Number.isInteger(reads) || reads < 1)) return { ok: false, exit: 2, error: `--reads must be a positive integer, got '${readsRaw}'\n${USAGE}` };
  const [cmd, target, ...rest] = args;
  if ((cmd !== "review" && cmd !== "consult" && cmd !== "biascheck") || !target) return { ok: false, exit: 2, error: USAGE };
  if (rest.length > 0) return { ok: false, exit: 2, error: `unexpected arguments: ${rest.join(" ")}\n${USAGE}` };
  if (cmd === "biascheck" && judgeSpecs.length > 0) warnings.push(`--judge is ignored for biascheck — it is a neutral median scorer with no judge seat`);
  return { ok: true, value: { cmd, target, item, readSpecs, judgeSpec: judgeSpecs.at(-1), reads, timeoutSec, warnings } };
}

// ── packet building ─────────────────────────────────────────────────────────
export function rangeEndpoint(range) {
  if (range.includes("...")) return range.split("...")[1] || "HEAD";
  if (range.includes("..")) return range.split("..")[1] || "HEAD";
  return range;
}

function renderPacketBody(kind, item, anchor, invocation, surface) {
  return [
    "=== GROUND TRUTH PACKET ===",
    `item: ${item}`,
    `anchor: ${anchor}`,
    `invocation: ${invocation}`,
    `surface (${kind}):`,
    "-----BEGIN SURFACE-----",
    surface,
    "-----END SURFACE-----",
  ].join("\n");
}

export function buildReviewPacket(range, item, cwd) {
  const endpoint = rangeEndpoint(range);
  let anchor, diffText;
  try {
    anchor = execFileSync("git", ["rev-parse", `${endpoint}^{commit}`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    // The freshness anchor is the REVIEWED range's endpoint, never the checkout's HEAD —
    // a stale advisory must be stale on its face.
    const detail = (e.stderr ?? String(e?.message ?? e)).split("\n")[0];
    return { ok: false, error: `anchor '${endpoint}': ${detail} — cannot pin the report's freshness anchor` };
  }
  try {
    diffText = execFileSync("git", ["diff", range], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const detail = (e.stderr ?? String(e?.message ?? e)).split("\n")[0];
    return { ok: false, error: `git diff ${range} failed: ${detail}` };
  }
  if (diffText.trim() === "") return { ok: false, error: `git diff ${range} is empty — nothing to review` };
  const label = item ?? `crew-review/${range}`;
  const warnings = range.includes("..") ? [] : [
    `range '${range}' diffs that commit against the WORKING TREE — uncommitted changes are included, and the anchor pins the base commit only`,
  ];
  return { ok: true, value: { kind: "review", item: label, anchor, warnings, body: renderPacketBody("diff", label, anchor, `crew.mjs review ${range}`, diffText) } };
}

export function buildConsultPacket(file, item, cwd) {
  let bytes;
  try {
    bytes = readFileSync(resolve(cwd, file));
  } catch (e) {
    return { ok: false, error: `read '${file}': ${String(e?.message ?? e)}` };
  }
  const anchor = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const label = item ?? `crew-consult/${file}`;
  return { ok: true, value: { kind: "consult", item: label, anchor, body: renderPacketBody("design", label, anchor, `crew.mjs consult ${file}`, bytes.toString("utf8")) } };
}

// The detection reference for biascheck is bundled at shared/TELLS.md, resolved relative to THIS
// script (not cwd), so it works from any repo the skill is invoked in. Missing = mechanical error.
export function resolveReference() {
  try {
    const bytes = readFileSync(new URL("../shared/TELLS.md", import.meta.url));
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, error: `cannot read the bundled research reference (shared/TELLS.md): ${String(e?.message ?? e)}` };
  }
}

export function buildBiascheckPacket(file, item, cwd) {
  let draft;
  try {
    draft = readFileSync(resolve(cwd, file));
  } catch (e) {
    return { ok: false, error: `read '${file}': ${String(e?.message ?? e)}` };
  }
  const reference = resolveReference();
  if (!reference.ok) return { ok: false, error: reference.error };
  const anchor = `sha256:${createHash("sha256").update(draft).digest("hex")}`;
  const referenceAnchor = `sha256:${createHash("sha256").update(reference.bytes).digest("hex")}`;
  const label = item ?? `biascheck/${file}`;
  // Neutral composition, validated to preserve discrimination: framing + reference + draft + a plain
  // score-first question. No ground-truth metadata header (it degraded the neutral read).
  const body = [
    "The following is corpus research on the tells that distinguish AI-generated writing from human writing. Use it as reference.",
    "",
    reference.bytes.toString("utf8"),
    "",
    "=== TEXT TO SCORE ===",
    draft.toString("utf8"),
    "=== END TEXT ===",
    "",
    "Score this text 0-100 for human-authored vs AI-generated (higher = more likely human-authored), then explain your reasoning.",
  ].join("\n");
  return { ok: true, value: { kind: "biascheck", item: label, anchor, referenceAnchor, body } };
}

// ── report & telemetry ──────────────────────────────────────────────────────
export function renderReport({ kind, anchor, at, crew, reads, judge, warnings = [], rubricAnchor }) {
  const lines = [];
  const anchorLine = `ANCHOR (${kind}): ${anchor} — reviewed at ${at}`;
  lines.push(anchorLine, "=".repeat(anchorLine.length));
  const seatLabel = (s) => `${s.role}=${s.family}:${s.tune}`;
  lines.push(`CREW: ${crew.reads.map(seatLabel).join(" ")} ${seatLabel(crew.judge)}${crew.judgeFallback ? " (fallback — claude CLI not found)" : ""}`);
  if (rubricAnchor) lines.push(`NOTE: rubric ${rubricAnchor}`);
  if (crew.sameFamily) lines.push(`NOTE: same-family crew (${crew.reads[0].family}) — install a second family CLI, or pass --read openai:… / --read google:…, for a cross-family seat`);
  if ([...crew.reads, crew.judge].some((s) => s.family === "google")) lines.push("NOTE: agy --sandbox provides terminal restrictions, not a strict read-only profile");
  for (const w of warnings) lines.push(`! ${w}`);
  for (const r of reads) {
    lines.push(`READ ${r.role}(${r.family}:${r.tune}): ${r.verdict}${r.skipReason ? ` [${r.skipReason}]` : ""}`);
    for (const f of r.findings) lines.push(`  - [${f.severity}] ${f.ref}: ${f.issue}${f.evidence ? ` (${f.evidence})` : ""}`);
  }
  if (judge.ok) {
    const v = judge.value;
    lines.push(`JUDGE: ${v.verdict} (${v.convergence}) — ${v.rationale}`);
    lines.push(`  discarded: ${v.discarded.length ? v.discarded.join(" | ") : "none"}`);
    lines.push(`  systemic: ${v.systemic.length ? v.systemic.join(" | ") : "none"}`);
  } else {
    lines.push(`JUDGE: FAILED — ${judge.error}`);
  }
  lines.push(anchorLine);
  lines.push("NOTE: REPORT ONLY — no action was taken; nothing was merged, fixed, or mutated.");
  return lines.join("\n");
}

export function renderBiascheckReport({ anchor, at, model, reads, authenticity, spread, scored, referenceAnchor, warnings = [] }) {
  const lines = [];
  const anchorLine = `ANCHOR (biascheck): ${anchor} — reviewed at ${at}`;
  lines.push(anchorLine, "=".repeat(anchorLine.length));
  lines.push(`READS: ${reads.length} × ${model}  (neutral median scorer — not a blind cross-family panel)`);
  if (typeof authenticity === "number") {
    lines.push(`AUTHENTICITY: ${authenticity}/100 (median of ${scored}${spread ? `; spread ${spread[0]}–${spread[1]}` : ""}; higher = reads more human; a signal, not a verdict)`);
  } else {
    lines.push(`AUTHENTICITY: unavailable — all ${reads.length} reads failed`);
  }
  if (referenceAnchor) lines.push(`NOTE: reference ${referenceAnchor}`);
  for (const w of warnings) lines.push(`! ${w}`);
  for (const r of reads) {
    lines.push(`READ ${r.role}(${r.family}:${r.tune}): ${typeof r.score === "number" ? `score=${r.score}` : `[${r.skipReason}]`}`);
    if (r.reasoning) lines.push(`  reasoning: ${r.reasoning}`);
    for (const f of r.findings) lines.push(`  - [tell] ${f.ref}: ${f.tell}${f.fix ? ` → ${f.fix}` : ""}`);
  }
  lines.push(anchorLine);
  lines.push("NOTE: REPORT ONLY — no action was taken; nothing was merged, fixed, or mutated.");
  return lines.join("\n");
}

export function appendTelemetry(calls, home = homedir()) {
  try {
    const dir = join(home, ".preflight");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "modelcalls.jsonl"), calls.map((c) => JSON.stringify(c) + "\n").join(""));
  } catch (e) {
    console.error(`! telemetry: could not append to ${join(home, ".preflight", "modelcalls.jsonl")} (${String(e?.message ?? e)}) — run unaffected`);
  }
}

// ── main ────────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { console.error(parsed.error); return parsed.exit; }
  const { cmd, target, item, readSpecs, judgeSpec, reads, timeoutSec, warnings } = parsed.value;
  const cwd = process.cwd();

  if (cmd === "biascheck") {
    if (readSpecs.length > 1) warnings.push(`--read given ${readSpecs.length} times — biascheck uses one model for all reads; using the last ('${readSpecs.at(-1)}')`);
    const chosen = chooseReads(detectFamilies(), { readSpec: readSpecs.at(-1), reads, timeoutSec });
    if (!chosen.ok) { console.error(chosen.error); return chosen.exit; }
    const packet = buildBiascheckPacket(target, item, cwd);
    if (!packet.ok) { console.error(packet.error); return 1; }
    const at = new Date().toISOString();
    const run = await runBiascheck(chosen.value.seats, packet.value, { cwd, timeoutMs: timeoutSec * 1000 });
    appendTelemetry(run.calls, process.env.CREW_HOME || undefined);
    console.log(renderBiascheckReport({
      anchor: packet.value.anchor, at, model: chosen.value.model, reads: run.reads,
      authenticity: run.authenticity, spread: run.spread, scored: run.scored,
      referenceAnchor: packet.value.referenceAnchor, warnings,
    }));
    return run.scored === 0 ? 1 : 0;
  }

  const chosen = chooseCrew(detectFamilies(), { readSpecs, judgeSpec, timeoutSec });
  if (!chosen.ok) { console.error(chosen.error); return chosen.exit; }
  const packet = cmd === "review" ? buildReviewPacket(target, item, cwd) : buildConsultPacket(target, item, cwd);
  if (!packet.ok) { console.error(packet.error); return 1; }
  const at = new Date().toISOString();
  const run = await runCrew(chosen.value, packet.value, { cwd, timeoutMs: timeoutSec * 1000 });
  appendTelemetry(run.calls, process.env.CREW_HOME || undefined);
  console.log(renderReport({ kind: cmd, anchor: packet.value.anchor, rubricAnchor: packet.value.rubricAnchor, at, crew: chosen.value, reads: run.reads, judge: run.judge, warnings: [...warnings, ...chosen.value.warnings, ...(packet.value.warnings ?? [])] }));
  return run.reads.every((r) => r.verdict === "skipped") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Detached seats sit in their own process groups, so a terminal Ctrl-C never reaches them.
  // Forward the signal: reap every live seat's group, then exit with the conventional code.
  for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.once(sig, () => { reapAllSeats(); process.exit(code); });
  }
  process.exitCode = await main();
}
