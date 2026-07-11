import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "crew.mjs");
const stubs = join(here, "stubs");
// Hermetic PATH: stubs shadow every model CLI (claude, codex, agy are ALL stubbed), node stays
// reachable for the stub shebangs, and git is exposed via a one-binary shim dir — never its whole
// containing directory, which on real machines also holds real model CLIs.
const gitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const shimDir = mkdtempSync(join(tmpdir(), "e2eshim-"));
symlinkSync(gitPath, join(shimDir, "git"));
const env = (home) => ({ ...process.env, PATH: `${stubs}${delimiter}${dirname(process.execPath)}${delimiter}${shimDir}`, CREW_HOME: home });

function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), "e2erepo-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-b", "main");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "root");
  writeFileSync(join(dir, "a.txt"), "one\n");
  git("add", "a.txt");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add a");
  return dir;
}

test("e2e review: cross-family stub crew, report on stdout, exit 0, telemetry rows", async () => {
  const repo = fixtureRepo();
  const home = mkdtempSync(join(tmpdir(), "e2ehome-"));
  const { stdout } = await run("node", [script, "review", "HEAD~1...HEAD"], { cwd: repo, env: env(home) });
  assert.match(stdout, /^ANCHOR \(review\): [0-9a-f]{40}/);
  assert.match(stdout, /CREW: recall=claude:opus precision=openai:gpt-5\.6-terra@medium judge=claude:opus/);
  assert.match(stdout, /e2e stub finding/);
  assert.match(stdout, /e2e codex finding/);
  assert.match(stdout, /JUDGE: approve \(converged\) — e2e stub judge/);
  assert.match(stdout, /REPORT ONLY/);
  const rows = readFileSync(join(home, ".flightcrew", "modelcalls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(rows.length, 3);
});

test("e2e consult: sha256 anchor, exit 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "e2edoc-"));
  writeFileSync(join(dir, "d.md"), "# doc\n");
  const home = mkdtempSync(join(tmpdir(), "e2ehome-"));
  const { stdout } = await run("node", [script, "consult", "d.md"], { cwd: dir, env: env(home) });
  assert.match(stdout, /^ANCHOR \(consult\): sha256:[0-9a-f]{64}/);
});

test("e2e biascheck: median authenticity score on stdout, exit 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "e2edraft-"));
  writeFileSync(join(dir, "post.md"), "The team leveraged a robust, comprehensive solution.\n");
  const home = mkdtempSync(join(tmpdir(), "e2ehome-"));
  const { stdout } = await run("node", [script, "biascheck", "post.md", "--reads", "3"], { cwd: dir, env: env(home) });
  assert.match(stdout, /^ANCHOR \(biascheck\): sha256:[0-9a-f]{64}/m);
  assert.match(stdout, /READS: 3 × openai:gpt-5\.6-terra@medium/);
  assert.match(stdout, /AUTHENTICITY: \d+\/100 \(median of 3/);
  assert.match(stdout, /NOTE: reference sha256:[0-9a-f]{64}/);
  assert.match(stdout, /\[tell\] "comprehensive": vocabulary tell/);
  assert.doesNotMatch(stdout, /JUDGE/);
  assert.match(stdout, /REPORT ONLY/);
});

test("e2e: zero CLIs on PATH exits 1 with install pointers", async () => {
  const repo = fixtureRepo();
  const bare = { ...process.env, PATH: dirname(process.execPath), CREW_HOME: mkdtempSync(join(tmpdir(), "h-")) };
  await assert.rejects(
    run("node", [script, "review", "HEAD~1...HEAD"], { cwd: repo, env: bare }),
    (e) => e.code === 1 && /install one of/.test(e.stderr),
  );
});

test("e2e: usage error exits 2", async () => {
  await assert.rejects(run("node", [script, "review"], { env: env(tmpdir()) }), (e) => e.code === 2 && /usage:/.test(e.stderr));
});

test("e2e: empty diff exits 1", async () => {
  const repo = fixtureRepo();
  await assert.rejects(
    run("node", [script, "review", "HEAD...HEAD"], { cwd: repo, env: env(mkdtempSync(join(tmpdir(), "h-"))) }),
    (e) => e.code === 1 && /empty/.test(e.stderr),
  );
});
