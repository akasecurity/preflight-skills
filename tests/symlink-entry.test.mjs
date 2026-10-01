import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// Node resolves symlinks when it computes import.meta.url for the entry module, but
// process.argv[1] stays whatever path was actually invoked. A guard that compares the two
// literally (`import.meta.url === pathToFileURL(process.argv[1]).href`) goes false whenever the
// invocation path runs through a symlink — a symlinked ~/.claude, macOS's /var -> /private/var —
// and the script silently no-ops with exit 0 instead of running its CLI body.
test("e2e: runs the CLI body when invoked through a symlinked repo path", async () => {
  const linkDir = mkdtempSync(join(tmpdir(), "symlinkrepo-"));
  const link = join(linkDir, "repo-link");
  symlinkSync(repoRoot, link);
  const script = join(link, "scripts", "crew.mjs");

  // Cheap, side-effect-free, no model CLI involved: `review` with no target hits the
  // usage-error branch of parseArgs before anything touches git or a model seat.
  await assert.rejects(run("node", [script, "review"]), (e) => e.code === 2 && /usage:/.test(e.stderr));
});
