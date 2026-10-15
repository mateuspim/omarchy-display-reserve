import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import vm from "node:vm"

// Runs the real stats.sh on this machine and reads its frames the way the
// shell does.
const source = readFileSync(new URL("../Stats.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "")
const Stats = {}
vm.runInNewContext(source, Stats)
const script = new URL("../stats.sh", import.meta.url).pathname

// stats.sh INTERVAL PROCESS_EVERY FRAMES
const run = (...args) => execFileSync("bash", [script, ...args.map(String)], { encoding: "utf8", timeout: 10000 })
const frames = text => text.split("@end\n").filter(frame => frame.trim()).map(Stats.parseFrame)

const tests = {
  "every frame ends with @end and carries a time"() {
    const text = run(0.2, 0, 2)
    assert.ok(text.endsWith("@end\n"))
    const parsed = frames(text)
    assert.equal(parsed.length, 2)
    assert.ok(parsed[1].time > parsed[0].time)
  },
  "a frame has every section the panels read"() {
    const [frame] = frames(run(0.1, 0, 1))
    for (const section of ["stat", "loadavg", "meminfo", "route", "net", "disk"])
      assert.ok(Array.isArray(frame[section]) && frame[section].length > 0, section)
    // Sensors, cpufreq and pressure can be missing, as in a CI VM; their
    // sections are there, empty.
    for (const section of ["model", "psi", "hwmon", "nvme", "freq", "drm"])
      assert.ok(Array.isArray(frame[section]), section)
    assert.equal(frame.procs, undefined)
  },
  "processes come every PROCESS_EVERY frames, from the first"() {
    const parsed = frames(run(0.1, 2, 3))
    assert.ok(parsed[0].procs.length > 10)
    assert.equal(parsed[1].procs, undefined)
    assert.ok(parsed[2].procs.length > 10)
  },
  "two frames make real loads and rates"() {
    const state = frames(run(0.3, 1, 2)).reduce(Stats.ingest, Stats.empty())
    assert.ok(state.cpu.total >= 0 && state.cpu.total <= 100)
    assert.ok(state.cpu.cores.length > 0)
    assert.ok(state.memory.total > 0)
    assert.ok(state.network.interface !== "")
    assert.ok(state.disks.length > 0)
    assert.ok(Array.isArray(state.processes))
  },
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
