import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderReport, appendTelemetry } from "../scripts/crew.mjs";

const crew = {
  reads: [
    { role: "recall", family: "claude", tune: "opus" },
    { role: "precision", family: "openai", tune: "medium" },
  ],
  judge: { role: "judge", family: "claude", tune: "opus" },
  sameFamily: false, judgeFallback: false,
};
const reads = [
  { role: "recall", family: "claude", tune: "opus", verdict: "concerns", findings: [{ severity: "high", ref: "a.txt:1", issue: "bad", evidence: "line 1" }], ms: 10 },
  { role: "precision", family: "openai", tune: "medium", verdict: "skipped", findings: [], skipReason: "timeout after 600s", ms: 600000 },
];
const judge = { ok: true, value: { verdict: "revise", convergence: "diverged", rationale: "because", discarded: ["x"], systemic: [] } };

test("report: anchor top and bottom, crew line, findings, judge, footer", () => {
  const out = renderReport({ kind: "review", anchor: "abc123", at: "2026-07-07T00:00:00.000Z", crew, reads, judge, warnings: ["w1"] });
  const lines = out.split("\n");
  const anchorLine = "ANCHOR (review): abc123 — reviewed at 2026-07-07T00:00:00.000Z";
  assert.equal(lines[0], anchorLine);
  assert.equal(lines.at(-2), anchorLine);
  assert.match(out, /CREW: recall=claude:opus precision=openai:medium judge=claude:opus/);
  assert.match(out, /! w1/);
  assert.match(out, /READ recall\(claude:opus\): concerns/);
  assert.match(out, /- \[high\] a\.txt:1: bad \(line 1\)/);
  assert.match(out, /READ precision\(openai:medium\): skipped \[timeout after 600s\]/);
  assert.match(out, /JUDGE: revise \(diverged\) — because/);
  assert.match(out, /discarded: x/);
  assert.match(out, /systemic: none/);
  assert.match(lines.at(-1), /REPORT ONLY/);
});

test("same-family note and judge fallback attribution", () => {
  const solo = {
    reads: [{ role: "recall", family: "claude", tune: "opus" }, { role: "precision", family: "claude", tune: "sonnet" }],
    judge: { role: "judge", family: "openai", tune: "medium" }, sameFamily: true, judgeFallback: true,
  };
  const out = renderReport({ kind: "consult", anchor: "sha256:ff", at: "2026-07-07T00:00:00.000Z", crew: solo, reads: [], judge: { ok: false, error: "nope" }, warnings: [] });
  assert.match(out, /same-family crew \(claude\)/);
  assert.match(out, /judge=openai:medium \(fallback/);
  assert.match(out, /JUDGE: FAILED — nope/);
});

test("google seat carries the sandbox caveat", () => {
  const g = { reads: [{ role: "recall", family: "google", tune: "default" }, { role: "precision", family: "claude", tune: "sonnet" }], judge: { role: "judge", family: "claude", tune: "opus" }, sameFamily: false, judgeFallback: false };
  const out = renderReport({ kind: "review", anchor: "a", at: "t", crew: g, reads: [], judge: { ok: false, error: "e" }, warnings: [] });
  assert.match(out, /agy --sandbox provides terminal restrictions, not a strict read-only profile/);
});

test("telemetry appends one JSONL row per call and never throws", () => {
  const home = mkdtempSync(join(tmpdir(), "crewhome-"));
  const rows = [{ at: "t", repo: "/r", cmd: "review", role: "recall", family: "claude", model: "opus", ms: 5, outcome: "ok", readOnly: "x" }];
  appendTelemetry(rows, home);
  appendTelemetry(rows, home);
  const lines = readFileSync(join(home, ".flightcrew", "modelcalls.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).family, "claude");
  // root bypasses POSIX permission checks — the degrade path can only be exercised unprivileged
  if (process.getuid?.() !== 0) {
    const ro = mkdtempSync(join(tmpdir(), "crewro-"));
    chmodSync(ro, 0o500);
    assert.doesNotThrow(() => appendTelemetry(rows, ro));
  }
});
