import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCrew } from "../scripts/crew.mjs";

// Stub seat: a node one-liner that captures its stdin to CAPTURE_DIR/<name>.txt
// and prints canned JSON. The judge stub keys off the reviewer-reads marker.
function stubSeat(role, name, captureDir, reply) {
  const js = `let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{require("fs").writeFileSync(${JSON.stringify(join(captureDir, name + ".txt"))},s);console.log(${JSON.stringify(reply)});});`;
  return { role, family: "claude", tune: name, brief: `${role}-brief`, contract: `${role}-contract`, packetVia: "stdin", readOnly: "stub", argv: ["node", "-e", js] };
}

const READ_REPLY = '{"verdict":"concerns","findings":[{"severity":"high","ref":"a.txt:1","issue":"stub issue"}]}';
const READ_REPLY_A = '{"verdict":"concerns","findings":[{"severity":"high","ref":"a.txt:1","issue":"stub issue A"}]}';
const READ_REPLY_B = '{"verdict":"concerns","findings":[{"severity":"high","ref":"a.txt:1","issue":"stub issue B"}]}';
const JUDGE_REPLY = '{"verdict":"approve","convergence":"converged","rationale":"stub judge","discarded":["fp1"],"systemic":[]}';
const packet = { kind: "review", item: "t", anchor: "abc", body: "PACKET-BODY" };

test("runCrew: blind identical packets, parsed reads, judge sees reads", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const crew = {
    reads: [stubSeat("recall", "r1", cap, READ_REPLY_A), stubSeat("precision", "r2", cap, READ_REPLY_B)],
    judge: stubSeat("judge", "j", cap, JUDGE_REPLY),
    sameFamily: true, judgeFallback: false,
  };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });

  const r1 = readFileSync(join(cap, "r1.txt"), "utf8");
  const r2 = readFileSync(join(cap, "r2.txt"), "utf8");
  // Structural blindness: identical input, and neither contains the other's output.
  assert.equal(r1.replace("recall-brief", "").replace("recall-contract", ""), r2.replace("precision-brief", "").replace("precision-contract", ""));
  assert.ok(!r1.includes("stub issue A") && !r1.includes("stub issue B") && !r2.includes("stub issue A") && !r2.includes("stub issue B"));

  assert.deepEqual(r.reads.map((x) => x.verdict), ["concerns", "concerns"]);
  assert.equal(r.reads[0].findings[0].ref, "a.txt:1");
  assert.equal(r.judge.ok, true);
  assert.deepEqual(r.judge.value.discarded, ["fp1"]);
  const judgeInput = readFileSync(join(cap, "j.txt"), "utf8");
  assert.match(judgeInput, /PACKET-BODY/);
  assert.match(judgeInput, /REVIEWER READS/);
  assert.match(judgeInput, /stub issue/);

  assert.equal(r.calls.length, 3);
  for (const c of r.calls) {
    assert.deepEqual(Object.keys(c).sort(), ["at", "cmd", "family", "model", "ms", "outcome", "readOnly", "repo", "role"]);
  }
});

test("a failed read becomes skipped with a reason; judge still runs", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const bad = { ...stubSeat("recall", "rb", cap, ""), argv: ["node", "-e", "process.exit(3)"] };
  const crew = { reads: [bad, stubSeat("precision", "rg", cap, READ_REPLY)], judge: stubSeat("judge", "j2", cap, JUDGE_REPLY), sameFamily: true, judgeFallback: false };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.reads[0].verdict, "skipped");
  assert.match(r.reads[0].skipReason, /exit 3/);
  assert.equal(r.judge.ok, true);
});

test("unparseable read output becomes skipped(no parsable JSON)", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const prose = { ...stubSeat("recall", "rp", cap, "I think it looks fine!") };
  const crew = { reads: [prose, stubSeat("precision", "rg2", cap, READ_REPLY)], judge: stubSeat("judge", "j3", cap, JUDGE_REPLY), sameFamily: true, judgeFallback: false };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.reads[0].verdict, "skipped");
  assert.match(r.reads[0].skipReason, /no parsable JSON/);
});

test("all reads skipped: judge is not spawned", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const bad = () => ({ ...stubSeat("recall", "x", cap, ""), argv: ["node", "-e", "process.exit(1)"] });
  const crew = { reads: [bad(), bad()], judge: stubSeat("judge", "never", cap, JUDGE_REPLY), sameFamily: true, judgeFallback: false };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.judge.ok, false);
  assert.match(r.judge.error, /nothing to judge/);
  assert.ok(!readdirSync(cap).includes("never.txt"));
  assert.equal(r.calls.length, 2);
});

test("judge failure surfaces as failed judge, reads survive", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const badJudge = { ...stubSeat("judge", "jb", cap, ""), argv: ["node", "-e", "process.exit(2)"] };
  const crew = { reads: [stubSeat("recall", "ra", cap, READ_REPLY), stubSeat("precision", "rc", cap, READ_REPLY)], judge: badJudge, sameFamily: true, judgeFallback: false };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.judge.ok, false);
  assert.deepEqual(r.reads.map((x) => x.verdict), ["concerns", "concerns"]);
});

test("a judge that echoes the reads it was given still parses", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const js = `let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{console.log("Considering the reads:\\n"+s+"\\nMy verdict:");console.log(${JSON.stringify(JUDGE_REPLY)});});`;
  const echoJudge = { role: "judge", family: "claude", tune: "echo", brief: "judge-brief", contract: "judge-contract", packetVia: "stdin", readOnly: "stub", argv: ["node", "-e", js] };
  const crew = { reads: [stubSeat("recall", "er1", cap, READ_REPLY), stubSeat("precision", "er2", cap, READ_REPLY)], judge: echoJudge, sameFamily: true, judgeFallback: false };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.judge.ok, true);
  assert.equal(r.judge.value.verdict, "approve");
});

test("judge prompt embeds reads under readVerdict, never a verdict key", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const crew = { reads: [stubSeat("recall", "kv1", cap, READ_REPLY), stubSeat("precision", "kv2", cap, READ_REPLY)], judge: stubSeat("judge", "kvj", cap, JUDGE_REPLY), sameFamily: true, judgeFallback: false };
  await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  const judgeInput = readFileSync(join(cap, "kvj.txt"), "utf8");
  assert.match(judgeInput, /"readVerdict"/);
  const readsSection = judgeInput.split("=== REVIEWER READS")[1];
  assert.ok(!/"verdict"/.test(readsSection), "embedded reads must not carry a bare verdict key");
});

test("malformed findings from a model normalize instead of rendering undefined", async () => {
  const cap = mkdtempSync(join(tmpdir(), "crewcap-"));
  const reply = '{"verdict":"concerns","findings":[{"issue":"bad"},"just a string",{"severity":"catastrophic","ref":"a:1","issue":"x"}]}';
  const crew = { reads: [stubSeat("recall", "nf1", cap, reply), stubSeat("precision", "nf2", cap, READ_REPLY)], judge: stubSeat("judge", "nfj", cap, JUDGE_REPLY), sameFamily: true, judgeFallback: false };
  const r = await runCrew(crew, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  const f = r.reads[0].findings;
  assert.deepEqual([f[0].severity, f[0].ref, f[0].issue], ["unrated", "unlocated", "bad"]);
  assert.equal(f[1].severity, "unrated");
  assert.equal(f[1].issue, "just a string");
  assert.deepEqual([f[2].severity, f[2].ref], ["unrated", "a:1"]);
});
