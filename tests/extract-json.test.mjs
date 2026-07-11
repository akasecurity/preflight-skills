import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../scripts/crew.mjs";

test("parses a whole-string JSON object", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("extracts an object wrapped in prose", () => {
  assert.deepEqual(extractJson('Here you go:\n{"verdict":"approve","findings":[]}\nHope that helps!', "findings"),
    { verdict: "approve", findings: [] });
});

test("discriminating key picks the unique match among several objects", () => {
  const text = '{"note":"x"} then {"findings":[],"verdict":"approve"}';
  assert.deepEqual(extractJson(text, "findings"), { findings: [], verdict: "approve" });
});

test("ambiguous discriminating key returns undefined", () => {
  assert.equal(extractJson('{"findings":[1]} and {"findings":[2]}', "findings"), undefined);
});

test("no JSON returns undefined", () => {
  assert.equal(extractJson("nothing here", "findings"), undefined);
});

test("braces inside strings do not break the scan", () => {
  assert.deepEqual(extractJson('x {"a":"{not json}","findings":[]} y', "findings"),
    { a: "{not json}", findings: [] });
});

test("arrays and null are not objects", () => {
  assert.equal(extractJson("[1,2]"), undefined);
  assert.equal(extractJson("null"), undefined);
});

test("a backslash in prose outside any string does not swallow the next object", () => {
  assert.deepEqual(extractJson('note: C:\\{"findings":[]}', "findings"), { findings: [] });
});
