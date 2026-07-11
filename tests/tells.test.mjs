import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveReference } from "../scripts/crew.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tells = join(here, "..", "shared", "TELLS.md");

test("resolveReference reads shared/TELLS.md", () => {
  const r = resolveReference();
  assert.equal(r.ok, true);
  assert.ok(r.bytes.length > 1000);
  assert.match(r.bytes.toString("utf8"), /what raw human casual writing looks like/);
});

test("TELLS.md reads as public corpus research, not an internal artifact", () => {
  const text = readFileSync(tells, "utf8");
  // Positive: it carries the public, cited research it is supposed to.
  assert.match(text, /corpus research/i);
  assert.match(text, /Kobak et al/);
  // Negative: no local filesystem paths leaked in (a generic scrub canary).
  assert.doesNotMatch(text, /\/Users\/|\/home\/\w/);
});
