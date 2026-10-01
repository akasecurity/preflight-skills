import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingFor, normalizeOpenaiTune, FAMILIES, AGY_TOOL_NOTE } from "../scripts/crew.mjs";

test("claude binding: read-only tools, stdin packet, role-default models", () => {
  const recall = bindingFor("claude", undefined, "recall", 600);
  assert.deepEqual(recall.argv, ["claude", "-p", "--model", "opus", "--allowedTools", "Read", "Grep", "Glob"]);
  assert.equal(recall.packetVia, "stdin");
  assert.equal(bindingFor("claude", undefined, "precision", 600).tune, "sonnet");
  assert.equal(bindingFor("claude", "haiku", "recall", 600).tune, "haiku");
});

test("openai binding: with no tune neither model nor effort is named (the Codex CLI default applies)", () => {
  for (const role of ["recall", "precision", "read", "judge"]) {
    const b = bindingFor("openai", undefined, role, 600);
    assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-"]);
    assert.equal(b.tune, "default@default");
    assert.equal(b.packetVia, "stdin");
  }
});

test("openai binding: an effort-only tune sets only the effort", () => {
  const b = bindingFor("openai", "high", "precision", 600);
  assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "model_reasoning_effort=high", "-"]);
  assert.equal(b.tune, "default@high");
});

test("openai binding: model@effort and legacy effort:model both pass through, unvalidated", () => {
  for (const tune of ["some-model@high", "high:some-model"]) {
    const b = bindingFor("openai", tune, "precision", 600);
    assert.deepEqual(b.argv, ["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "model=some-model", "-c", "model_reasoning_effort=high", "-"]);
    assert.equal(b.tune, "some-model@high");
  }
  assert.equal(normalizeOpenaiTune("unknown-slug@whatever").tune, "unknown-slug@whatever");
  assert.equal(normalizeOpenaiTune(normalizeOpenaiTune("m@e").tune).tune, "m@e", "idempotent on its display form");
  assert.equal(normalizeOpenaiTune("default@medium").model, "");
});

test("claude binding: tier names and the old aliases resolve to the CLI alias; an explicit model passes through", () => {
  const model = (tune) => { const a = bindingFor("claude", tune, "read", 600).argv; return a[a.indexOf("--model") + 1]; };
  assert.deepEqual(["fast", "balanced", "extra", "cheap", "standard", "most-capable"].map(model), ["haiku", "sonnet", "opus", "haiku", "sonnet", "opus"]);
  assert.equal(model("some-explicit-model"), "some-explicit-model");
});

test("google binding: agy sandbox, print-timeout matches seat, packet inline as the -p value", () => {
  const b = bindingFor("google", undefined, "recall", 300);
  assert.deepEqual(b.argv, ["agy", "--sandbox", "--print-timeout", "300s", "-p"]);
  assert.equal(b.packetVia, "arg");
  // headless agy auto-denies shell/out-of-workspace tools, so its seats carry a tool-limits note
  assert.equal(b.toolNote, AGY_TOOL_NOTE);
  assert.match(b.toolNote, /Do NOT run shell or terminal commands/);
  assert.equal(bindingFor("claude", undefined, "recall", 300).toolNote, undefined);
  assert.equal(bindingFor("openai", undefined, "recall", 300).toolNote, undefined);
  const pinned = bindingFor("google", "gemini-3-pro", "recall", 600);
  assert.deepEqual(pinned.argv, ["agy", "--sandbox", "--print-timeout", "600s", "--model", "gemini-3-pro", "-p"]);
});

test("unknown family returns undefined", () => {
  assert.equal(bindingFor("mistral", undefined, "recall", 600), undefined);
});

test("family-to-binary map", () => {
  assert.deepEqual(FAMILIES, { claude: "claude", openai: "codex", google: "agy" });
});

test("every family binding carries family + readOnly for telemetry", () => {
  const expected = {
    claude: "allowed-tools (Read/Grep/Glob)",
    openai: "sandbox read-only",
    google: "sandbox (terminal restrictions — not strict read-only)",
  };
  for (const [family, readOnly] of Object.entries(expected)) {
    const b = bindingFor(family, undefined, "recall", 600);
    assert.equal(b.family, family, `${family}: family field`);
    assert.equal(b.readOnly, readOnly, `${family}: readOnly field`);
  }
});
