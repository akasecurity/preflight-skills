import { test } from "node:test";
import assert from "node:assert/strict";
import { runBiascheck } from "../scripts/crew.mjs";

// Stub seat: a node one-liner that prints canned JSON (ignores stdin).
function stubSeat(role, reply) {
  const js = `process.stdin.resume();process.stdin.on("end",()=>console.log(${JSON.stringify(reply)}));`;
  return { role, family: "openai", tune: "gpt-5.6-terra@medium", brief: "b", contract: "c", packetVia: "stdin", readOnly: "stub", argv: ["node", "-e", js] };
}
const packet = { kind: "biascheck", item: "t", anchor: "sha256:abc", body: "BODY" };

test("runBiascheck: median of numeric scores, spread, findings normalized", async () => {
  const seats = [
    stubSeat("read1", '{"score":91,"reasoning":"human","findings":[]}'),
    stubSeat("read2", '{"score":42,"reasoning":"ai","findings":[{"ref":"\\"leveraged\\"","tell":"vocab","fix":"plain verb"}]}'),
    stubSeat("read3", '{"score":63,"reasoning":"mixed","findings":[]}'),
  ];
  const r = await runBiascheck(seats, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.authenticity, 63);
  assert.deepEqual(r.spread, [42, 91]);
  assert.equal(r.scored, 3);
  assert.equal(r.reads[1].findings[0].tell, "vocab");
  assert.equal(r.calls.length, 3);
});

test("runBiascheck: unparseable read is excluded, not fatal", async () => {
  const seats = [
    stubSeat("read1", '{"score":80,"reasoning":"h","findings":[]}'),
    stubSeat("read2", "not json at all"),
  ];
  const r = await runBiascheck(seats, packet, { cwd: process.cwd(), timeoutMs: 5000 });
  assert.equal(r.scored, 1);
  assert.equal(r.authenticity, 80);
  assert.match(r.reads[1].skipReason, /no parsable score/);
});
