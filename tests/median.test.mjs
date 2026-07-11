import { test } from "node:test";
import assert from "node:assert/strict";
import { median, normalizeTell, TELLS_READ_BRIEF, TELLS_READ_CONTRACT } from "../scripts/crew.mjs";

test("median: odd length is the middle", () => {
  assert.equal(median([42, 91, 63]), 63);
});
test("median: even length is the mean of the two middles", () => {
  assert.equal(median([40, 60, 80, 100]), 70);
});
test("normalizeTell: keeps ref/tell/fix, tolerates junk", () => {
  assert.deepEqual(normalizeTell({ ref: "\"leveraged\"", tell: "vocabulary", fix: "use a plain verb" }), { ref: "\"leveraged\"", tell: "vocabulary", fix: "use a plain verb" });
  assert.deepEqual(normalizeTell({ ref: "x", tell: "y" }), { ref: "x", tell: "y" });
  assert.deepEqual(normalizeTell(null), { ref: "unlocated", tell: "null" });
});
test("neutral brief carries no persona or forced-flag framing", () => {
  assert.doesNotMatch(TELLS_READ_BRIEF, /de-slop panel|err toward reporting|be harsh/i);
  assert.match(TELLS_READ_CONTRACT, /"score"/);
  assert.match(TELLS_READ_CONTRACT, /optional/i);
});
