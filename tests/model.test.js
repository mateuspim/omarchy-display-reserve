import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

// Model.js is a QML `.pragma library` script; strip the pragma and run it as
// a plain script so its functions land on the sandbox.
const source = readFileSync(new URL("../Model.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "")
const Model = {}
vm.runInNewContext(source, Model)

const tests = {
  "normalize fills missing edges and defaults to enabled"() {
    assert.deepEqual({ ...Model.normalize({ top: "350.4", left: -5 }) }, { enabled: true, top: 350, bottom: 0, left: 0, right: 0 })
    assert.deepEqual({ ...Model.normalize(undefined) }, { enabled: true, top: 0, bottom: 0, left: 0, right: 0 })
  },
  "paused entries reserve nothing but keep their values"() {
    const raw = { top: 350, enabled: false }
    assert.equal(Model.total(Model.active(raw)), 0)
    assert.equal(Model.normalize(raw).top, 350)
  },
  "summary lists reserved edges and flags paused ones"() {
    assert.equal(Model.summary(Model.normalize({})), "No reserved edges")
    assert.equal(Model.summary(Model.normalize({ top: 350, left: 40 })), "Top 350 px  ·  Left 40 px")
    assert.equal(Model.summary(Model.normalize({ top: 350, enabled: false })), "Paused  ·  Top 350 px")
  },
  "limit keeps a tenth of the axis usable"() {
    assert.equal(Model.limit("top", 1080, 1920), 1728)
    assert.equal(Model.limit("left", 1080, 1920), 972)
    assert.equal(Model.limit("top", 0, 0), 4000)
  },
  "fromPointer measures from the dragged edge and snaps"() {
    // 1080x1920 monitor drawn at 0.1 scale -> 108x192 preview.
    assert.equal(Model.fromPointer("top", 50, 35, 108, 192, 0.1, 10, 1728), 350)
    assert.equal(Model.fromPointer("bottom", 50, 172, 108, 192, 0.1, 10, 1728), 200)
    assert.equal(Model.fromPointer("right", 104, 50, 108, 192, 0.1, 1, 972), 40)
    assert.equal(Model.fromPointer("top", 50, -20, 108, 192, 0.1, 10, 1728), 0)
    assert.equal(Model.fromPointer("top", 50, 190, 108, 192, 0.1, 10, 1728), 1728)
  },
  "nudge clamps to the valid range"() {
    assert.equal(Model.nudge(5, -10, 100), 0)
    assert.equal(Model.nudge(95, 10, 100), 100)
    assert.equal(Model.nudge(350, 100, 1728), 450)
  },
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
