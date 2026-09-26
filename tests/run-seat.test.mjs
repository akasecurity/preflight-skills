import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSeat, killSeat, liveSeats, reapAllSeats, inlinePromptLimit } from "../scripts/crew.mjs";

const echoSeat = (extra = {}) => ({
  role: "recall", family: "claude", tune: "test", brief: "BRIEF", contract: "CONTRACT",
  packetVia: "stdin", argv: ["node", "-e", "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(s.toUpperCase()))"], ...extra,
});

test("stdin seat: composes brief+contract+packet on stdin, captures stdout", async () => {
  const r = await runSeat(echoSeat(), "packet-body", 5000);
  assert.equal(r.outcome, "ok");
  assert.match(r.stdout, /BRIEF\n\nCONTRACT\n\nPACKET-BODY/);
  assert.equal(typeof r.ms, "number");
});

test("timeout kills the child and reports outcome timeout", async () => {
  const seat = echoSeat({ argv: ["node", "-e", "setTimeout(()=>{},10000)"] });
  const r = await runSeat(seat, "x", 200);
  assert.equal(r.outcome, "timeout");
});

test("nonzero exit reports outcome error with code", async () => {
  const seat = echoSeat({ argv: ["node", "-e", "console.error('boom');process.exit(3)"] });
  const r = await runSeat(seat, "x", 5000);
  assert.deepEqual([r.outcome, r.code], ["error", 3]);
  assert.match(r.stderr, /boom/);
});

test("spawn failure (missing binary) reports outcome error", async () => {
  const seat = echoSeat({ argv: ["definitely-not-a-real-binary-xyz"] });
  const r = await runSeat(seat, "x", 5000);
  assert.equal(r.outcome, "error");
});

test("arg seat: brief+contract+packet travel inline as the last argv element, stdin empty", async () => {
  const seat = echoSeat({
    packetVia: "arg",
    // echo the appended prompt arg and whatever arrived on stdin (must be nothing)
    argv: ["node", "-e", "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.stringify({arg:process.argv[1],stdin:s})))", "--"],
  });
  const r = await runSeat(seat, "INLINE-PACKET-BODY", 5000);
  assert.equal(r.outcome, "ok");
  assert.deepEqual(JSON.parse(r.stdout), { arg: "BRIEF\n\nCONTRACT\n\nINLINE-PACKET-BODY", stdin: "" });
});

test("toolNote, when present, sits between brief and contract", async () => {
  const r = await runSeat(echoSeat({ toolNote: "NOTE" }), "packet-body", 5000);
  assert.match(r.stdout, /^BRIEF\n\nNOTE\n\nCONTRACT\n\nPACKET-BODY/);
});

test("arg seat: a prompt over the argv bound fails loudly without spawning or truncating", async () => {
  const seat = echoSeat({ packetVia: "arg", argv: ["node", "-e", "console.log('SPAWNED')", "--"] });
  const r = await runSeat(seat, "x".repeat(200), 5000, { argLimit: 100 });
  assert.equal(r.outcome, "error");
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /packet too large to pass inline to node \(\d+ bytes > 100-byte argv bound\)/);
});

test("arg seat: the bound counts utf8 bytes, not characters", async () => {
  const seat = echoSeat({ packetVia: "arg", brief: "", contract: "", argv: ["node", "-e", "console.log('SPAWNED')", "--"] });
  // 40 em-dashes = 40 chars but 120 bytes; with the 4 separator bytes that is 124 > 100
  const r = await runSeat(seat, "—".repeat(40), 5000, { argLimit: 100 });
  assert.equal(r.outcome, "error");
});

test("inlinePromptLimit: under Linux's 128 KiB per-arg cap and macOS's 1 MiB ARG_MAX", () => {
  assert.ok(inlinePromptLimit("linux") < 128 * 1024);
  assert.ok(inlinePromptLimit("darwin") < 1024 * 1024);
  assert.ok(inlinePromptLimit("win32") < 32 * 1024);
});

test("multi-byte utf8 split across chunks is not corrupted", async () => {
  const js = "const b=Buffer.from('—');process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),50);";
  const seat = echoSeat({ argv: ["node", "-e", js] });
  const r = await runSeat(seat, "x", 5000);
  assert.equal(r.outcome, "ok");
  assert.ok(r.stdout.includes("—"), `expected em-dash intact, got ${JSON.stringify(r.stdout)}`);
});

test("malformed argv resolves outcome error instead of rejecting", async () => {
  const seat = echoSeat({ argv: [] });
  const r = await runSeat(seat, "x", 5000);
  assert.equal(r.outcome, "error");
});

const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitFor = async (pred, ms = 1000, step = 25) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (pred()) return true; await new Promise((r) => setTimeout(r, step)); }
  return pred();
};

test("killSeat: kills the process group by negative pid, no fallback", () => {
  const calls = [];
  const child = { pid: 4242, kill: (sig) => calls.push(["child", sig]) };
  killSeat(child, { kill: (pid, sig) => calls.push(["group", pid, sig]) });
  assert.deepEqual(calls, [["group", -4242, "SIGKILL"]]);
});

test("killSeat: falls back to single-child kill when group kill throws", () => {
  const calls = [];
  const child = { pid: 4242, kill: (sig) => calls.push(["child", sig]) };
  killSeat(child, { kill: () => { throw new Error("EPERM"); } });
  assert.deepEqual(calls, [["child", "SIGKILL"]]);
});

test("killSeat: no pid yet — single-child kill, group branch skipped", () => {
  const calls = [];
  const child = { pid: undefined, kill: (sig) => calls.push(["child", sig]) };
  killSeat(child, { kill: (pid, sig) => calls.push(["group", pid, sig]) });
  assert.deepEqual(calls, [["child", "SIGKILL"]]);
});

test("reapAllSeats: group-kills every live seat and clears the registry", () => {
  const calls = [];
  const a = { pid: 11, kill: () => calls.push(["a-child"]) };
  const b = { pid: 22, kill: () => calls.push(["b-child"]) };
  liveSeats.add(a); liveSeats.add(b);
  try {
    reapAllSeats({ kill: (pid, sig) => calls.push(["group", pid, sig]) });
    assert.deepEqual(calls.sort(), [["group", -11, "SIGKILL"], ["group", -22, "SIGKILL"]].sort());
    assert.equal(liveSeats.size, 0, "registry cleared after reap");
  } finally {
    liveSeats.clear();
  }
});

test("runSeat registers a live seat while running and deregisters on finish", async () => {
  assert.equal(liveSeats.size, 0, "registry starts empty");
  const seat = echoSeat({ argv: ["node", "-e", "setTimeout(()=>{},10000)"] });
  const p = runSeat(seat, "x", 300);
  const registered = await waitFor(() => liveSeats.size === 1, 1000);
  assert.ok(registered, "seat is registered while running");
  const r = await p;
  assert.equal(r.outcome, "timeout");
  assert.equal(liveSeats.size, 0, "seat deregistered on finish");
});

test("timeout reaps a grandchild process, not just the direct child", async () => {
  const pidfile = join(mkdtempSync(join(tmpdir(), "reap-")), "gc.pid");
  const prev = process.env.REAP_PIDFILE;
  process.env.REAP_PIDFILE = pidfile;
  try {
    const seat = echoSeat({
      argv: ["node", "-e",
        "const{spawn}=require('child_process'),fs=require('fs');" +
        "const gc=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});" +
        "fs.writeFileSync(process.env.REAP_PIDFILE,String(gc.pid));" +
        "setInterval(()=>{},1000);"],
    });
    const r = await runSeat(seat, "x", 500);
    assert.equal(r.outcome, "timeout");
    const gpid = Number(readFileSync(pidfile, "utf8"));
    const dead = await waitFor(() => !isAlive(gpid), 1500);
    if (!dead) { try { process.kill(gpid, "SIGKILL"); } catch {} } // avoid leaking a runaway on failure
    assert.ok(dead, "grandchild should be reaped when the seat times out");
  } finally {
    if (prev === undefined) delete process.env.REAP_PIDFILE; else process.env.REAP_PIDFILE = prev;
  }
});
