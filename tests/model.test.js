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
  "same compares edges and the enabled flag"() {
    assert.ok(Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: true })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 20 })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: false })))
  },
  "limit keeps a tenth of the axis usable"() {
    assert.equal(Model.limit("top", 1080, 1920), 1728)
    assert.equal(Model.limit("left", 1080, 1920), 972)
    assert.equal(Model.limit("top", 0, 0), 4000)
  },
  "opposite edges share the limit"() {
    assert.equal(Model.limit("bottom", 1080, 1920, 1700), 28)
    assert.equal(Model.limit("right", 1080, 1920, 2000), 0)
  },
  "fit trims hand-edited entries to the shared limit"() {
    const fitted = Model.fit(Model.normalize({ top: 5000, bottom: 400, left: 100, right: 100 }), 1080, 1920)
    assert.deepEqual({ ...fitted }, { enabled: true, top: 1728, bottom: 0, left: 100, right: 100 })
    const kept = Model.fit(Model.normalize({ top: 400, bottom: 200 }), 1080, 1920)
    assert.equal(kept.top, 400)
    assert.equal(kept.bottom, 200)
  },
  "fromDrag moves from the press value towards the middle and snaps"() {
    // 1080x1920 monitor drawn at 0.1 scale: one preview pixel is 10 px.
    assert.equal(Model.fromDrag("top", 350, 0, 5, 0.1, 10, 1728), 400)
    assert.equal(Model.fromDrag("bottom", 200, 0, 5, 0.1, 10, 1728), 150)
    assert.equal(Model.fromDrag("left", 40, 3, 0, 0.1, 1, 972), 70)
    assert.equal(Model.fromDrag("right", 40, 3, 0, 0.1, 1, 972), 10)
    assert.equal(Model.fromDrag("top", 100, 0, -50, 0.1, 10, 1728), 0)
    assert.equal(Model.fromDrag("top", 100, 0, 500, 0.1, 10, 1728), 1728)
    assert.equal(Model.fromDrag("top", 405, 0, 0, 0, 10, 1728), 405)
  },
  "notches counts whole wheel steps in either direction"() {
    assert.equal(Model.notches(119), 0)
    assert.equal(Model.notches(240), 2)
    assert.equal(Model.notches(-130), -1)
  },
  "outputKeys prefers a unique description over the connector"() {
    const keys = Model.outputKeys([
      { name: "DP-4", description: "Dell Inc. DELL U2720Q 1A2B3C4" },
      { name: "DP-5", description: "" },
      { name: "HDMI-A-1", description: "Same Panel 0" },
      { name: "HDMI-A-2", description: "Same Panel 0" },
    ])
    assert.deepEqual({ ...keys }, { "DP-4": "Dell Inc. DELL U2720Q 1A2B3C4", "DP-5": "DP-5", "HDMI-A-1": "HDMI-A-1", "HDMI-A-2": "HDMI-A-2" })
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
