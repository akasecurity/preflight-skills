// Capability tiers (fast / balanced / extra): no code default names an OpenAI model id, and nothing in
// the tier ladder resolves to or mentions Fable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TIERS, TIER_ALIASES, TIER_DESCRIPTIONS, CLAUDE_TIER_ALIAS, canonicalTier, bindingFor } from "../scripts/crew.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("tiers: three names, old names accepted as aliases, unknown names undefined", () => {
  assert.deepEqual(TIERS, ["fast", "balanced", "extra"]);
  assert.deepEqual(TIER_ALIASES, { cheap: "fast", standard: "balanced", "most-capable": "extra" });
  assert.deepEqual(["cheap", "standard", "most-capable", "extra"].map(canonicalTier), ["fast", "balanced", "extra", "extra"]);
  assert.equal(canonicalTier("turbo"), undefined);
  assert.equal(canonicalTier("toString"), undefined);
  assert.deepEqual(CLAUDE_TIER_ALIAS, { fast: "haiku", balanced: "sonnet", extra: "opus" });
});

test("tier descriptions: superpowers wording under our names, never 'most capable available'", () => {
  assert.deepEqual(Object.keys(TIER_DESCRIPTIONS), TIERS);
  assert.equal(TIER_DESCRIPTIONS.extra, "architecture, design and the final review, on the top rung of this ladder");
  for (const t of Object.values(TIER_DESCRIPTIONS)) assert.doesNotMatch(t, /most capable (model )?available/i);
});

test("no tier, alias, description or claude resolution selects or mentions Fable; an explicit model passes through", () => {
  const FABLE = /fable/i;
  for (const name of [...TIERS, ...Object.keys(TIER_ALIASES)]) {
    assert.doesNotMatch(String(canonicalTier(name)), FABLE);
    assert.doesNotMatch(bindingFor("claude", name, "read", 600).argv.join(" "), FABLE);
  }
  for (const role of ["recall", "precision", "judge", "read"]) assert.doesNotMatch(bindingFor("claude", undefined, role, 600).argv.join(" "), FABLE);
  for (const text of [...Object.values(TIER_DESCRIPTIONS), JSON.stringify(TIER_ALIASES), JSON.stringify(CLAUDE_TIER_ALIAS)]) assert.doesNotMatch(text, FABLE);
  assert.ok(bindingFor("claude", "fable", "read", 600).argv.includes("fable"));
});

function files(dir, re) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), re) : re.test(e.name) ? [join(dir, e.name)] : []));
}

test("no code default or skill text names an OpenAI model id", () => {
  const OPENAI_ID = /\bgpt-\d[\w.-]*/;
  const offenders = [];
  for (const f of [...files(join(ROOT, "scripts"), /\.(mjs|js)$/), ...files(join(ROOT, "workflows"), /\.js$/), ...files(join(ROOT, "skills"), /\.md$/)]) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => { if (OPENAI_ID.test(line)) offenders.push(`${f.slice(ROOT.length + 1)}:${i + 1}`); });
  }
  assert.deepEqual(offenders, []);
});
