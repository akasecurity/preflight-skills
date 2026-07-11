import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../scripts/crew.mjs";

test("review with range and defaults", () => {
  const r = parseArgs(["review", "main...HEAD"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    cmd: "review", target: "main...HEAD", item: undefined,
    readSpecs: [], judgeSpec: undefined, reads: 3, timeoutSec: 600, warnings: [],
  });
});

test("consult with all flags", () => {
  const r = parseArgs(["consult", "doc.md", "--item", "x", "--read", "claude:opus", "--read", "openai:high", "--judge", "claude:opus", "--timeout", "300"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.readSpecs, ["claude:opus", "openai:high"]);
  assert.equal(r.value.judgeSpec, "claude:opus");
  assert.equal(r.value.timeoutSec, 300);
});

test("repeated --judge keeps last and warns", () => {
  const r = parseArgs(["review", "HEAD~1...HEAD", "--judge", "claude", "--judge", "openai"]);
  assert.equal(r.value.judgeSpec, "openai");
  assert.equal(r.value.warnings.length, 1);
  assert.match(r.value.warnings[0], /only the last/);
});

test("missing target is a usage error", () => {
  const r = parseArgs(["review"]);
  assert.deepEqual({ ok: r.ok, exit: r.exit }, { ok: false, exit: 2 });
});

test("unknown command is a usage error", () => {
  assert.equal(parseArgs(["frobnicate", "x"]).ok, false);
});

test("bad timeout is a usage error", () => {
  assert.equal(parseArgs(["review", "a...b", "--timeout", "zero"]).ok, false);
});

test("trailing unknown arguments are a usage error", () => {
  assert.equal(parseArgs(["review", "a...b", "extra"]).ok, false);
});

test("flag missing its value is a usage error", () => {
  const r1 = parseArgs(["review", "a...b", "--item"]);
  assert.deepEqual({ ok: r1.ok, exit: r1.exit }, { ok: false, exit: 2 });
  assert.match(r1.error, /missing value for --item/);
  const r2 = parseArgs(["review", "a...b", "--read", "--judge", "x"]);
  assert.equal(r2.ok, false);
  assert.match(r2.error, /missing value for --read/);
});

test("parseArgs accepts the biascheck verb with a file", () => {
  const r = parseArgs(["biascheck", "draft.md"]);
  assert.equal(r.ok, true);
  assert.equal(r.value.cmd, "biascheck");
  assert.equal(r.value.target, "draft.md");
});

test("parseArgs rejects biascheck with no file", () => {
  const r = parseArgs(["biascheck"]);
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2);
});

test("parseArgs: --reads sets the biascheck read count", () => {
  const r = parseArgs(["biascheck", "d.md", "--reads", "5"]);
  assert.equal(r.ok, true);
  assert.equal(r.value.reads, 5);
});
test("parseArgs: reads defaults to 3", () => {
  assert.equal(parseArgs(["biascheck", "d.md"]).value.reads, 3);
});
test("parseArgs: --reads must be a positive integer", () => {
  assert.equal(parseArgs(["biascheck", "d.md", "--reads", "0"]).exit, 2);
  assert.equal(parseArgs(["biascheck", "d.md", "--reads", "two"]).exit, 2);
});
test("parseArgs: --judge on biascheck warns and is ignored", () => {
  const r = parseArgs(["biascheck", "d.md", "--judge", "openai"]);
  assert.equal(r.ok, true);
  assert.ok(r.value.warnings.some((w) => /judge.*biascheck|biascheck.*judge/i.test(w)));
});
