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
const runWith = (env, ...args) => execFileSync("bash", [script, ...args.map(String)], { encoding: "utf8", timeout: 10000, env: { ...process.env, ...env } })
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
    for (const section of ["model", "psi", "hwmon", "nvme", "freq", "drm", "power", "rapl"])
      assert.ok(Array.isArray(frame[section]), section)
    for (const section of ["system"])
      assert.ok(Array.isArray(frame[section]), section)
    assert.equal(frame.procs, undefined)
  },
  "processes come every PROCESS_EVERY frames, from the first"() {
    const parsed = frames(run(0.1, 2, 3))
    assert.ok(parsed[0].procs.length > 10)
    assert.equal(parsed[1].procs, undefined)
    assert.ok(parsed[2].procs.length > 10)
  },
  "slow sensors come every fifth frame, from the first"() {
    const parsed = frames(run(0.05, 0, 6))
    assert.ok(Array.isArray(parsed[0].slowhwmon))
    assert.ok(Array.isArray(parsed[0].nvme))
    for (const i of [1, 2, 3, 4]) assert.equal(parsed[i].slowhwmon, undefined)
    assert.ok(Array.isArray(parsed[5].slowhwmon))
  },
  "system facts come every sixtieth frame, from the first"() {
    const parsed = frames(run(0.05, 0, 2))
    const info = Object.fromEntries(parsed[0].sysinfo.map(line => line.split("\t")))
    assert.ok(info.os && info.cpu, JSON.stringify(info))
    // Omarchy's version is its package's, as omarchy-version gives it.
    const pkg = execFileSync("bash", ["-c", "pacman -Q omarchy 2>/dev/null | cut -d' ' -f2 || true"], { encoding: "utf8" }).trim()
    if (pkg) assert.equal(info.omarchy, pkg)
    const channel = execFileSync("bash", ["-c", "command -v omarchy-version-channel >/dev/null && omarchy-version-channel || true"], { encoding: "utf8" }).trim()
    if (channel) assert.equal(info.channel, channel)
    assert.equal(parsed[1].sysinfo, undefined)
  },
  "STATS_NVIDIA=0 keeps nvidia-smi from running for the GPU apps"() {
    const [frame] = frames(runWith({ STATS_NVIDIA: "0" }, 0.1, 1, 1))
    assert.ok(frame.procs.length > 10)
    assert.equal(frame.gpuapps, undefined)
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
