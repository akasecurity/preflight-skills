import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectFamilies, chooseCrew } from "../scripts/crew.mjs";

function binDir(...names) {
  const dir = mkdtempSync(join(tmpdir(), "crewbin-"));
  for (const n of names) { writeFileSync(join(dir, n), "#!/bin/sh\n"); chmodSync(join(dir, n), 0o755); }
  return dir;
}

test("detectFamilies maps binaries on PATH to families", () => {
  const dir = binDir("claude", "agy");
  assert.deepEqual([...detectFamilies({ PATH: dir })].sort(), ["claude", "google"]);
  assert.equal(detectFamilies({ PATH: mkdtempSync(join(tmpdir(), "empty-")) }).size, 0);
});

const all = new Set(["claude", "openai", "google"]);

test("two-plus families: claude recall + codex precision, claude judge", () => {
  const r = chooseCrew(all, { timeoutSec: 600 });
  assert.equal(r.ok, true);
  const { reads, judge, sameFamily, judgeFallback } = r.value;
  assert.deepEqual(reads.map((s) => [s.role, s.family, s.tune]), [["recall", "claude", "opus"], ["precision", "openai", "gpt-5.6-terra@medium"]]);
  assert.deepEqual([judge.family, judge.tune, sameFamily, judgeFallback], ["claude", "opus", false, false]);
});

test("claude+google without codex: google takes the precision seat", () => {
  const r = chooseCrew(new Set(["claude", "google"]), { timeoutSec: 600 });
  assert.equal(r.value.reads[1].family, "google");
});

test("claude only: intra-family opus+sonnet mix, sameFamily flagged", () => {
  const r = chooseCrew(new Set(["claude"]), { timeoutSec: 600 });
  assert.deepEqual(r.value.reads.map((s) => [s.family, s.tune]), [["claude", "opus"], ["claude", "sonnet"]]);
  assert.equal(r.value.sameFamily, true);
});

test("openai only: two efforts, judge falls back attributed", () => {
  const r = chooseCrew(new Set(["openai"]), { timeoutSec: 600 });
  assert.deepEqual(r.value.reads.map((s) => s.tune), ["gpt-5.6-terra@high", "gpt-5.6-terra@medium"]);
  assert.deepEqual([r.value.judge.family, r.value.judgeFallback], ["openai", true]);
});

test("zero families: mechanical failure with install pointers", () => {
  const r = chooseCrew(new Set(), { timeoutSec: 600 });
  assert.deepEqual({ ok: r.ok, exit: r.exit }, { ok: false, exit: 1 });
  assert.match(r.error, /install/i);
});

test("--read specs override detection; missing binary is a clear error", () => {
  const r = chooseCrew(new Set(["claude"]), { readSpecs: ["claude:opus", "openai:high"], timeoutSec: 600 });
  assert.equal(r.ok, false);
  assert.match(r.error, /--read/);
  assert.match(r.error, /codex/);
});

test("unknown --read family refuses cleanly", () => {
  const r = chooseCrew(all, { readSpecs: ["mistral"], timeoutSec: 600 });
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported --read family 'mistral'/);
});

test("--judge override is honored", () => {
  const r = chooseCrew(all, { judgeSpec: "openai:high", timeoutSec: 600 });
  assert.deepEqual([r.value.judge.family, r.value.judge.tune], ["openai", "gpt-5.6-sol@high"]);
});

test("seats carry role briefs and contracts", () => {
  const r = chooseCrew(all, { timeoutSec: 600 });
  assert.match(r.value.reads[0].brief, /RECALL/);
  assert.match(r.value.reads[1].brief, /PRECISION/);
  assert.match(r.value.judge.brief, /judge/i);
  assert.match(r.value.reads[0].contract, /"findings"/);
  assert.match(r.value.judge.contract, /"convergence"/);
});

test("one or three --read seats are honored but warned", () => {
  const r1 = chooseCrew(all, { readSpecs: ["claude:opus"], timeoutSec: 600 });
  assert.equal(r1.value.reads.length, 1);
  assert.match(r1.value.warnings[0], /two blind reads/);
  const r3 = chooseCrew(all, { readSpecs: ["claude", "openai", "google"], timeoutSec: 600 });
  assert.equal(r3.value.reads.length, 3);
  assert.equal(r3.value.warnings.length, 1);
});

test("default detection crews carry no warnings", () => {
  assert.deepEqual(chooseCrew(all, { timeoutSec: 600 }).value.warnings, []);
});

test("--judge for an absent family errors naming binary and flag", () => {
  const r = chooseCrew(new Set(["claude"]), { judgeSpec: "openai:high", timeoutSec: 600 });
  assert.equal(r.ok, false);
  assert.match(r.error, /--judge/);
  assert.match(r.error, /codex/);
});

test("detectFamilies ignores a directory named like a binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "crewbin-"));
  mkdirSync(join(dir, "claude"), { mode: 0o755 });
  assert.equal(detectFamilies({ PATH: dir }).size, 0);
});

test("review crew uses the code briefs and score-free contracts", () => {
  const r = chooseCrew(new Set(["claude", "openai"]), {});
  assert.equal(r.ok, true);
  assert.match(r.value.reads[0].brief, /bugs|smells/i);      // existing review brief
  assert.doesNotMatch(r.value.reads[0].contract, /score/);
});
