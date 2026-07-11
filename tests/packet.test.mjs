import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rangeEndpoint, buildReviewPacket, buildConsultPacket, buildBiascheckPacket } from "../scripts/crew.mjs";

test("rangeEndpoint", () => {
  assert.equal(rangeEndpoint("main...feature"), "feature");
  assert.equal(rangeEndpoint("a..b"), "b");
  assert.equal(rangeEndpoint("HEAD~2"), "HEAD~2");
});

function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), "crewrepo-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-b", "main");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "root");
  writeFileSync(join(dir, "a.txt"), "one\n");
  git("add", "a.txt");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add a");
  return { dir, git };
}

test("review packet: anchor is the range endpoint sha, body carries the diff", () => {
  const { dir, git } = fixtureRepo();
  const head = git("rev-parse", "HEAD").trim();
  const r = buildReviewPacket("HEAD~1...HEAD", undefined, dir);
  assert.equal(r.ok, true);
  assert.equal(r.value.anchor, head);
  assert.equal(r.value.item, "crew-review/HEAD~1...HEAD");
  assert.match(r.value.body, /\+one/);
  assert.match(r.value.body, /anchor: /);
});

test("review packet: bad range is a mechanical error", () => {
  const { dir } = fixtureRepo();
  assert.equal(buildReviewPacket("nope...HEAD", undefined, dir).ok, false);
});

test("bad range does not leak raw git stderr to the parent process", () => {
  const { dir } = fixtureRepo();
  const script = `import("${new URL("../scripts/crew.mjs", import.meta.url).href}").then((m) => { const r = m.buildReviewPacket("HEAD...nope", undefined, ${JSON.stringify(dir)}); process.exit(r.ok ? 1 : 0); });`;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.equal(res.stderr, "", `expected no stderr leak, got: ${res.stderr}`);
});

test("anchor error carries the underlying git message", () => {
  const { dir } = fixtureRepo();
  const r = buildReviewPacket("HEAD...nope", undefined, dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /anchor 'nope'/);
  assert.match(r.error, /cannot pin the report's freshness anchor/);
  assert.match(r.error, /ambiguous|unknown revision|fatal/i);
});

test("review packet: empty diff is a mechanical error", () => {
  const { dir } = fixtureRepo();
  const r = buildReviewPacket("HEAD...HEAD", undefined, dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /empty/);
});

test("consult packet: sha256 anchor of exact bytes, no git needed", () => {
  const dir = mkdtempSync(join(tmpdir(), "crewdoc-"));
  writeFileSync(join(dir, "design.md"), "# design\n");
  const r = buildConsultPacket("design.md", "my-item", dir);
  assert.equal(r.ok, true);
  assert.match(r.value.anchor, /^sha256:[0-9a-f]{64}$/);
  assert.equal(r.value.item, "my-item");
  assert.match(r.value.body, /# design/);
});

test("consult packet: missing file is a mechanical error", () => {
  assert.equal(buildConsultPacket("no-such.md", undefined, tmpdir()).ok, false);
});

test("review packet: single-rev range warns it diffs against the working tree", () => {
  const { dir } = fixtureRepo();
  const r = buildReviewPacket("HEAD~1", undefined, dir);
  assert.equal(r.ok, true);
  assert.equal(r.value.warnings.length, 1);
  assert.match(r.value.warnings[0], /WORKING TREE/);
});

test("review packet: a...b range carries no warnings", () => {
  const { dir } = fixtureRepo();
  const r = buildReviewPacket("HEAD~1...HEAD", undefined, dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.warnings, []);
});

test("biascheck packet: neutral body carries the reference and the draft, sha256 anchors", () => {
  const dir = mkdtempSync(join(tmpdir(), "crewdraft-"));
  writeFileSync(join(dir, "post.md"), "The team leveraged a robust solution.\n");
  const r = buildBiascheckPacket("post.md", undefined, dir);
  assert.equal(r.ok, true);
  assert.equal(r.value.kind, "biascheck");
  assert.match(r.value.anchor, /^sha256:[0-9a-f]{64}$/);
  assert.match(r.value.referenceAnchor, /^sha256:[0-9a-f]{64}$/);
  assert.match(r.value.body, /corpus research on the tells/);   // neutral framing
  assert.match(r.value.body, /=== TEXT TO SCORE ===/);
  assert.match(r.value.body, /leveraged a robust/);              // draft surface
  assert.match(r.value.body, /Score this text 0-100/);          // trailing question
  assert.doesNotMatch(r.value.body, /GROUND TRUTH PACKET/);      // no metadata header
});

test("biascheck packet: missing draft is a mechanical error", () => {
  assert.equal(buildBiascheckPacket("no-such.md", undefined, tmpdir()).ok, false);
});
