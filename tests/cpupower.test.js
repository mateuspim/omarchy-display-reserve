import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// cpu-power.sh against a made-up powercap tree, so nothing here needs root
// or touches /sys and /etc.
const script = new URL("../cpu-power.sh", import.meta.url).pathname
const root = mkdtempSync(join(tmpdir(), "cpu-power-"))
const env = { ...process.env, CPU_POWER_SYSFS: root }
const run = (...args) => spawnSync("bash", [script, ...args], { encoding: "utf8", env, input: "" })

// A RAPL zone: energy_uj readable or root's, as the kernel leaves it.
const zone = (name, readable) => {
  mkdirSync(join(root, name), { recursive: true })
  writeFileSync(join(root, name, "energy_uj"), "123456\n")
  chmodSync(join(root, name, "energy_uj"), readable ? 0o444 : 0o000)
}
const reset = () => { rmSync(root, { recursive: true, force: true }); mkdirSync(root) }

const tests = {
  "status is none without a RAPL counter"() {
    reset()
    zone("intel-rapl-mmio:0", false)
    assert.equal(run("status").stdout, "none\n")
  },
  "status is locked while the counter is root's"() {
    reset()
    zone("intel-rapl:0", false)
    zone("intel-rapl:0:0", false)
    assert.equal(run("status").stdout, "locked\n")
  },
  "status is on once every package's counter is readable"() {
    reset()
    zone("intel-rapl:0", true)
    zone("intel-rapl:0:0", false)
    assert.equal(run("status").stdout, "on\n")
    zone("intel-rapl:1", false)
    assert.equal(run("status").stdout, "locked\n")
  },
  "enabling writes the udev rule and opens the counters now"() {
    const commands = run("commands", "enable").stdout
    assert.match(commands, /> \/etc\/udev\/rules\.d\/70-rapl-energy\.rules/)
    assert.match(commands, /SUBSYSTEM=="powercap", ACTION=="add", RUN\+="\/bin\/chmod a\+r \/sys%p\/energy_uj"/)
    assert.match(commands, /chmod a\+r \/sys\/class\/powercap\/\*\/energy_uj/)
  },
  "disabling removes the rule and gives the counters back to root"() {
    const commands = run("commands", "disable").stdout
    assert.match(commands, /rm -f \/etc\/udev\/rules\.d\/70-rapl-energy\.rules/)
    assert.match(commands, /chmod 0400 \/sys\/class\/powercap\/\*\/energy_uj/)
  },
  "enable and disable refuse to run without a terminal to confirm in"() {
    for (const action of ["enable", "disable"]) {
      const result = run(action)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /terminal/)
    }
  },
  "anything else prints the usage"() {
    const result = run("bogus")
    assert.equal(result.status, 2)
    assert.match(result.stderr, /usage/i)
  },
}

let failed = 0
for (const [name, test] of Object.entries(tests)) {
  try { test(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
rmSync(root, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
