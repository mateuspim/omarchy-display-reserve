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
    assert.deepEqual({ ...Model.normalize({ top: "350.4", left: -5 }) }, { enabled: true, fill: "black", clockEdge: "largest", top: 350, bottom: 0, left: 0, right: 0 })
    assert.deepEqual({ ...Model.normalize(undefined) }, { enabled: true, fill: "black", clockEdge: "largest", top: 0, bottom: 0, left: 0, right: 0 })
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
  "fill defaults to black and keeps only known values"() {
    assert.equal(Model.normalize({ fill: "wallpaper" }).fill, "wallpaper")
    assert.equal(Model.normalize({ fill: "logo" }).fill, "logo")
    assert.equal(Model.normalize({ fill: "clock" }).fill, "clock")
    assert.equal(Model.normalize({ fill: "rainbow" }).fill, "black")
    assert.equal(Model.active({ top: 10, fill: "logo", enabled: false }).fill, "logo")
  },
  "nextFill cycles through every fill"() {
    const seen = ["black"]
    for (let fill = Model.nextFill("black"); fill !== "black"; fill = Model.nextFill(fill)) seen.push(fill)
    assert.deepEqual(seen, ["black", "theme", "logo", "wallpaper", "dim", "clock"])
  },
  "wallpaper and dim both draw the wallpaper"() {
    assert.ok(Model.showsWallpaper("wallpaper"))
    assert.ok(Model.showsWallpaper("dim"))
    assert.ok(!Model.showsWallpaper("logo"))
  },
  "the clock goes on the largest edge and the others stay black"() {
    const entry = Model.normalize({ top: 40, bottom: 300, left: 300, fill: "clock" })
    assert.equal(Model.clockEdge(entry), "bottom")
    assert.equal(Model.edgeFill(entry, "bottom"), "clock")
    assert.equal(Model.edgeFill(entry, "top"), "black")
    assert.equal(Model.edgeFill(entry, "left"), "black")
    assert.equal(Model.clockEdge(Model.normalize({})), "")
    const logo = Model.normalize({ top: 460, right: 500, fill: "logo" })
    assert.equal(Model.edgeFill(logo, "right"), "logo")
    assert.equal(Model.edgeFill(logo, "top"), "logo")
    assert.equal(Model.edgeFill(Model.normalize({ top: 40, left: 90, fill: "dim" }), "top"), "dim")
  },
  "the clock can prefer the top or bottom edge"() {
    const entry = Model.normalize({ top: 460, bottom: 100, right: 510, fill: "clock", clockEdge: "topBottom" })
    assert.equal(Model.clockEdge(entry), "top")
    assert.equal(Model.edgeFill(entry, "top"), "clock")
    assert.equal(Model.edgeFill(entry, "right"), "black")
    assert.equal(Model.clockEdge(Model.normalize({ top: 40, bottom: 90, left: 500, clockEdge: "topBottom" })), "bottom")
    assert.equal(Model.clockEdge(Model.normalize({ left: 500, right: 600, clockEdge: "topBottom" })), "right")
    assert.equal(Model.normalize({ clockEdge: "middle" }).clockEdge, "largest")
  },
  "clockText is 24-hour HH:MM"() {
    assert.equal(Model.clockText(new Date(2026, 8, 29, 7, 5)), "07:05")
    assert.equal(Model.clockText(new Date(2026, 8, 29, 23, 59)), "23:59")
  },
  "clockBitmap lays glyphs out with a gap"() {
    const one = Model.clockBitmap("1")
    assert.equal(one.columns, 3)
    assert.equal(one.cells.length, 8)
    const time = Model.clockBitmap("12:34")
    assert.equal(time.columns, 3 + 1 + 3 + 1 + 1 + 1 + 3 + 1 + 3)
    assert.equal(time.rows, 5)
    assert.ok(time.cells.some(cell => cell.x === 8 && cell.y === 1), "colon's top dot")
    assert.ok(time.cells.every(cell => cell.x < time.columns && cell.y < 5))
    const stacked = Model.clockBitmap(["12", "34"])
    assert.equal(stacked.columns, 7)
    assert.equal(stacked.rows, 11)
    assert.ok(stacked.cells.some(cell => cell.y === 10))
  },
  "clockLayout stays upright and picks the bigger blocks"() {
    const wide = Model.clockLayout("12:34", 1080, 460)
    assert.equal(wide.columns, 17)
    assert.equal(wide.cell, 56)
    const tall = Model.clockLayout("12:34", 510, 1460)
    assert.equal(tall.columns, 7)
    assert.equal(tall.rows, 11)
    assert.equal(tall.cell, 56)
    assert.ok(Model.clockLayout("12:34", 30, 20).cell < 2)
  },
  "clockShift moves every 5 minutes within one cell"() {
    assert.deepEqual({ ...Model.clockShift(new Date(2026, 8, 29, 0, 4)) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Model.clockShift(new Date(2026, 8, 29, 0, 5)) }, { x: 1, y: 0 })
    for (let minute = 0; minute < 1440; minute += 5) {
      const shift = Model.clockShift(new Date(2026, 8, 29, 0, minute))
      assert.ok(Math.abs(shift.x) <= 1 && Math.abs(shift.y) <= 1)
    }
  },
  "logoStep is a fiftieth of the smaller side, at least a pixel"() {
    assert.equal(Model.logoStep(400, 100), 2)
    assert.equal(Model.logoStep(20, 10), 1)
  },
  "shortSummary drops units and the fill, and abbreviates past two edges"() {
    assert.equal(Model.shortSummary(Model.normalize({})), "No reserved edges")
    assert.equal(Model.shortSummary(Model.normalize({ top: 460, bottom: 490, fill: "logo" })), "Top 460  ·  Bottom 490")
    assert.equal(Model.shortSummary(Model.normalize({ top: 460, left: 40, right: 40, enabled: false })), "Paused  ·  T 460  ·  L 40  ·  R 40")
  },
  "fullscreenChanges fits fullscreen windows on reserved monitors only"() {
    const clients = [
      { address: "0xa", monitor: 1, fullscreen: 2, fullscreenClient: 2 },
      { address: "0xb", monitor: 0, fullscreen: 2, fullscreenClient: 2 },
      { address: "0xc", monitor: 1, fullscreen: 1, fullscreenClient: 0 }
    ]
    const result = Model.fullscreenChanges(clients, [1], [])
    assert.deepEqual([...result.changes].map(c => ({ ...c })), [{ address: "0xa", internal: 1, client: 2 }])
    assert.deepEqual([...result.fitted], ["0xa"])
  },
  "fullscreenChanges keeps fitted windows and lets them leave fullscreen"() {
    const kept = Model.fullscreenChanges([{ address: "0xa", monitor: 1, fullscreen: 1, fullscreenClient: 2 }], [1], ["0xa"])
    assert.equal(kept.changes.length, 0)
    assert.deepEqual([...kept.fitted], ["0xa"])
    const again = Model.fullscreenChanges([{ address: "0xa", monitor: 1, fullscreen: 2, fullscreenClient: 2 }], [1], ["0xa"])
    assert.deepEqual([...again.changes].map(c => ({ ...c })), [{ address: "0xa", internal: 0, client: 0 }])
    assert.deepEqual([...again.fitted], [])
    const left = Model.fullscreenChanges([{ address: "0xa", monitor: 1, fullscreen: 0, fullscreenClient: 0 }], [1], ["0xa"])
    assert.deepEqual([...left.fitted], [])
  },
  "untilNextMinute counts down to the minute"() {
    assert.equal(Model.untilNextMinute(new Date(2026, 8, 29, 7, 5, 59, 900)), 100)
    assert.equal(Model.untilNextMinute(new Date(2026, 8, 29, 7, 5, 0, 0)), 60000)
  },
  "summary names a fill other than black"() {
    assert.equal(Model.summary(Model.normalize({ top: 350, fill: "wallpaper" })), "Top 350 px  ·  Wallpaper")
    assert.equal(Model.summary(Model.normalize({ top: 350, fill: "dim" })), "Top 350 px  ·  Dimmed")
    assert.equal(Model.summary(Model.normalize({ fill: "logo" })), "No reserved edges")
  },
  "imageOffset lines a full-screen image up with the strip"() {
    assert.deepEqual({ ...Model.imageOffset("top", 400, 1080, 1920) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Model.imageOffset("bottom", 400, 1080, 1920) }, { x: 0, y: -1520 })
    assert.deepEqual({ ...Model.imageOffset("left", 40, 1080, 1920) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Model.imageOffset("right", 40, 1080, 1920) }, { x: -1040, y: 0 })
  },
  "svgAspect reads the viewBox, then width and height"() {
    assert.equal(Model.svgAspect('<svg fill="none" height="285" viewBox="0 0 1215 285" width="1215">', 4), 1215 / 285)
    assert.equal(Model.svgAspect('<svg viewBox="-10,-10, 200,100">', 4), 2)
    assert.equal(Model.svgAspect('<svg width="300" height="100">', 4), 3)
    assert.equal(Model.svgAspect("<svg>", 4), 4)
    assert.equal(Model.svgAspect("", 4), 4)
  },
  "recolorSvg repaints black fills and leaves the rest"() {
    assert.equal(Model.recolorSvg('<svg fill="none"><g fill="#000"><path fill="black"/></g></svg>', "#d8a657"),
      '<svg fill="none"><g fill="#d8a657"><path fill="#d8a657"/></g></svg>')
  },
  "blockBitmap reads two characters per cell"() {
    const art = Model.blockBitmap("████  ██\n██    ██\n")
    assert.equal(art.columns, 4)
    assert.equal(art.rows, 2)
    assert.deepEqual([...art.cells.map(cell => cell.x + "," + cell.y)], ["0,0", "1,0", "3,0", "0,1", "3,1"])
    assert.equal(Model.blockBitmap("").rows, 0)
  },
  "logoLayout stacks the icon over the wordmark only when asked"() {
    const icon = { columns: 27, rows: 26, cells: [] }
    const wide = Model.logoLayout(1080, 460, 1215 / 285, icon, false)
    assert.ok(!wide.stacked)
    assert.equal(wide.width, 540)
    const tall = Model.logoLayout(510, 1920, 1215 / 285, icon, true)
    assert.ok(tall.stacked)
    assert.equal(tall.cell, 13)
    assert.equal(tall.width, 351)
    assert.ok(!Model.logoLayout(510, 1920, 1215 / 285, null, true).stacked)
  },
  "hexColor formats and clamps channels"() {
    assert.equal(Model.hexColor(1, 0, 0.5), "#ff0080")
    assert.equal(Model.hexColor(2, -1, 0), "#ff0000")
  },
  "same compares edges, the enabled flag and the fill"() {
    assert.ok(Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: true })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 20 })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: false })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, fill: "logo" })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, clockEdge: "topBottom" })))
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
    assert.deepEqual({ ...fitted }, { enabled: true, fill: "black", clockEdge: "largest", top: 1728, bottom: 0, left: 100, right: 100 })
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
