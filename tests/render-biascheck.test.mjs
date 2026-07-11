import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBiascheckReport } from "../scripts/crew.mjs";

test("renderBiascheckReport: median headline, spread, per-read, no judge line", () => {
  const reads = [
    { role: "read1", family: "openai", tune: "gpt-5.6-terra@medium", score: 91, reasoning: "reads human", findings: [] },
    { role: "read2", family: "openai", tune: "gpt-5.6-terra@medium", score: 42, reasoning: "reads AI", findings: [{ ref: "\"leveraged\"", tell: "vocabulary", fix: "plain verb" }] },
    { role: "read3", family: "openai", tune: "gpt-5.6-terra@medium", findings: [], skipReason: "timeout after 600s" },
  ];
  const out = renderBiascheckReport({
    anchor: "sha256:abc", at: "2026-07-11T00:00:00Z", model: "openai:gpt-5.6-terra@medium",
    reads, authenticity: 66, spread: [42, 91], scored: 2, referenceAnchor: "sha256:def",
  });
  assert.match(out, /^ANCHOR \(biascheck\): sha256:abc/);
  assert.match(out, /READS: 3 × openai:gpt-5\.6-terra@medium/);
  assert.match(out, /AUTHENTICITY: 66\/100 \(median of 2; spread 42–91/);
  assert.match(out, /NOTE: reference sha256:def/);
  assert.match(out, /READ read2\(openai:gpt-5\.6-terra@medium\): score=42/);
  assert.match(out, /- \[tell\] "leveraged": vocabulary → plain verb/);
  assert.match(out, /READ read3\(.*\): \[timeout after 600s\]/);
  assert.doesNotMatch(out, /JUDGE/);
  assert.match(out, /REPORT ONLY/);
});

test("renderBiascheckReport: all reads failed says so", () => {
  const out = renderBiascheckReport({ anchor: "sha256:x", at: "t", model: "openai:gpt-5.6-terra@medium", reads: [{ role: "read1", family: "openai", tune: "t", findings: [], skipReason: "cli error" }], authenticity: undefined, spread: undefined, scored: 0 });
  assert.match(out, /AUTHENTICITY: unavailable/);
});
