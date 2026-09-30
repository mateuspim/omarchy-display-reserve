.pragma library

var EDGES = ["top", "bottom", "left", "right"]
// What a reserved edge shows. Black is the default and the only one that is
// safe on OLED panels; the others keep a static image in the same place
// (the clock shifts a little now and then, but its digits stay lit).
var FILLS = ["black", "theme", "logo", "wallpaper", "dim", "clock"]
var FILL_NAMES = { black: "Black", theme: "Theme", wallpaper: "Wallpaper", dim: "Dimmed", logo: "Logo", clock: "Clock" }
// Where the clock fill goes: the largest reserved edge, or the larger of
// the top and bottom edges.
var CLOCK_EDGES = ["largest", "topBottom"]

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

function pixels(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

function isHorizontal(side) {
  return side === "top" || side === "bottom"
}

function opposite(side) {
  return { top: "bottom", bottom: "top", left: "right", right: "left" }[side]
}

function title(side) {
  return side.charAt(0).toUpperCase() + side.slice(1)
}

// Stored entries may be partial or hand-edited; everything reads through this.
function normalize(raw) {
  var entry = raw || {}
  var result = {
    enabled: entry.enabled !== false,
    fill: FILLS.indexOf(entry.fill) !== -1 ? entry.fill : "black",
    clockEdge: CLOCK_EDGES.indexOf(entry.clockEdge) !== -1 ? entry.clockEdge : "largest"
  }
  for (var i = 0; i < EDGES.length; i++) result[EDGES[i]] = pixels(entry[EDGES[i]])
  return result
}

// What is actually on screen: a paused output reserves nothing.
function active(raw) {
  var entry = normalize(raw)
  if (!entry.enabled) for (var i = 0; i < EDGES.length; i++) entry[EDGES[i]] = 0
  return entry
}

// Whether two normalized entries reserve, enable and fill the same.
function same(a, b) {
  if (a.enabled !== b.enabled || a.fill !== b.fill || a.clockEdge !== b.clockEdge) return false
  for (var i = 0; i < EDGES.length; i++) if (a[EDGES[i]] !== b[EDGES[i]]) return false
  return true
}

function total(entry) {
  var sum = 0
  for (var i = 0; i < EDGES.length; i++) sum += entry[EDGES[i]] || 0
  return sum
}

function summary(entry) {
  var parts = []
  for (var i = 0; i < EDGES.length; i++)
    if (entry[EDGES[i]] > 0) parts.push(title(EDGES[i]) + " " + entry[EDGES[i]] + " px")
  if (!parts.length) return "No reserved edges"
  if (entry.fill && entry.fill !== "black") parts.push(fillName(entry.fill))
  return (entry.enabled === false ? "Paused  ·  " : "") + parts.join("  ·  ")
}

function nextFill(fill) {
  return FILLS[(FILLS.indexOf(fill) + 1) % FILLS.length]
}

function fillName(fill) {
  return FILL_NAMES[fill] || title(String(fill))
}

// Whether a fill draws the wallpaper, so its path has to be kept current.
function showsWallpaper(fill) {
  return fill === "wallpaper" || fill === "dim"
}

// The largest reserved edge among `sides`, the first on a tie. "" when none
// is reserved.
function largestEdge(entry, sides) {
  var best = ""
  for (var i = 0; i < sides.length; i++)
    if (entry[sides[i]] > 0 && (!best || entry[sides[i]] > entry[best])) best = sides[i]
  return best
}

// The one edge that shows the clock, following the entry's clockEdge: the
// largest edge, or the larger of top and bottom while either is reserved.
function clockEdge(entry) {
  return (entry.clockEdge === "topBottom" && largestEdge(entry, ["top", "bottom"])) || largestEdge(entry, EDGES)
}

// What `side` of a normalized entry shows. There is one clock per monitor;
// its other edges stay black.
function edgeFill(entry, side) {
  return entry.fill === "clock" && side !== clockEdge(entry) ? "black" : entry.fill
}

// Blocky 3x5 digits in the style of clock-tui, one string per row.
var GLYPHS = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": ["##.", ".#.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  ":": [".", "#", ".", "#", "."]
}

// 24-hour HH:MM.
function clockText(date) {
  return ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2)
}

// The lit cells of `lines` (a string or an array of them) in GLYPHS, with
// one blank cell between glyphs and between lines, each line centered, as
// { columns, rows, cells: [{ x, y }] }. Unknown characters are skipped.
function clockBitmap(lines) {
  lines = [].concat(lines)
  var widths = lines.map(function(line) {
    var width = 0
    for (var i = 0; i < line.length; i++) {
      var glyph = GLYPHS[line.charAt(i)]
      if (glyph) width += (width > 0 ? 1 : 0) + glyph[0].length
    }
    return width
  })
  var columns = Math.max.apply(null, widths)
  var cells = []
  for (var n = 0; n < lines.length; n++) {
    var x = Math.floor((columns - widths[n]) / 2)
    var top = n * 6
    for (var i = 0; i < lines[n].length; i++) {
      var glyph = GLYPHS[lines[n].charAt(i)]
      if (!glyph) continue
      for (var row = 0; row < glyph.length; row++)
        for (var column = 0; column < glyph[row].length; column++)
          if (glyph[row].charAt(column) === "#") cells.push({ x: x + column, y: top + row })
      x += glyph[0].length + 1
    }
  }
  return { columns: columns, rows: lines.length * 6 - 1, cells: cells }
}

// The clock for a strip of `width` by `height`, always upright: HH:MM on one
// line, or HH over MM when that gives bigger blocks, as on a side edge.
// `cell` is the block size, leaving a block of margin all round; whole
// pixels once they are 2 or more.
function clockLayout(text, width, height) {
  var parts = String(text).split(":")
  var best = null
  var options = [clockBitmap(text), clockBitmap(parts)]
  for (var i = 0; i < options.length; i++) {
    var option = options[i]
    option.cell = Math.max(0, Math.min(width / (option.columns + 2), height / (option.rows + 2)))
    if (!best || option.cell > best.cell) best = option
  }
  if (best.cell >= 2) best.cell = Math.floor(best.cell)
  return best
}

// Where the clock sits, in steps from the middle of the strip. It moves one
// step every 5 minutes around a 3x3 square so no pixel stays lit for long.
var SHIFTS = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
function clockShift(date) {
  var step = SHIFTS[Math.floor((date.getHours() * 60 + date.getMinutes()) / 5) % SHIFTS.length]
  return { x: step[0], y: step[1] }
}

// Milliseconds until the next minute starts, for a clock that ticks on it.
function untilNextMinute(date) {
  return 60000 - date.getSeconds() * 1000 - date.getMilliseconds()
}

// Width over height of an SVG, from its viewBox or else its width and
// height attributes; `fallback` when it has neither.
function svgAspect(svg, fallback) {
  var box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg || "")
  if (box && Number(box[2]) > 0) return Number(box[1]) / Number(box[2])
  var width = /\swidth="([\d.]+)"/.exec(svg || "")
  var height = /\sheight="([\d.]+)"/.exec(svg || "")
  if (width && height && Number(height[1]) > 0) return Number(width[1]) / Number(height[1])
  return fallback
}

// Repaints a black SVG in `color` (#rrggbb).
function recolorSvg(svg, color) {
  return String(svg || "").replace(/fill="(#000|#000000|black)"/gi, 'fill="' + color + '"')
}

// #rrggbb for channels in 0..1, as a QML color exposes them.
function hexColor(r, g, b) {
  return "#" + [r, g, b].map(function(channel) {
    return ("0" + Math.round(clamp(channel, 0, 1) * 255).toString(16)).slice(-2)
  }).join("")
}

// The lit cells of block art such as Omarchy's icon.txt, where two
// characters make one square cell, as { columns, rows, cells: [{ x, y }] }.
function blockBitmap(text) {
  var lines = String(text || "").split("\n").filter(function(line) { return line.trim() !== "" })
  var cells = []
  var columns = 0
  for (var y = 0; y < lines.length; y++) {
    columns = Math.max(columns, Math.ceil(lines[y].length / 2))
    for (var x = 0; x * 2 < lines[y].length; x++)
      if (lines[y].charAt(x * 2) === "\u2588") cells.push({ x: x, y: y })
  }
  return { columns: columns, rows: lines.length, cells: cells }
}

// How the logo fits a strip of `width` by `height`, always upright: the
// wordmark alone, or with `stacked` (the side edges) Omarchy's icon over the
// wordmark. `aspect` is the wordmark's width over height and `icon` the
// icon's blockBitmap; without one the wordmark stands alone. Returns
// { stacked, width, cell, gap }: `width` is the wordmark's (and the icon's)
// width and `cell` the icon's block size.
function logoLayout(width, height, aspect, icon, stacked) {
  if (!stacked || !icon || !icon.columns || !icon.rows)
    return { stacked: false, width: Math.max(0, Math.min(width * 0.5, height * 0.4 * aspect)), cell: 0, gap: 0 }
  var cell = Math.max(0, Math.min(width * 0.7, height * 0.8 / (icon.rows / icon.columns + 0.15 + 1 / aspect))) / icon.columns
  if (cell >= 2) cell = Math.floor(cell)
  return { stacked: true, width: cell * icon.columns, cell: cell, gap: Math.round(cell * icon.columns * 0.15) }
}

// Where a full-screen image sits inside the strip for `side`, so the strip
// shows exactly the slice of it that is on screen there.
function imageOffset(side, pixels, width, height) {
  return {
    x: side === "right" ? pixels - width : 0,
    y: side === "bottom" ? pixels - height : 0
  }
}

// Never let a typo swallow the whole monitor: a tenth of each axis stays
// usable, so the bar and the panel remain reachable. Opposite edges share
// that budget, so `oppositePixels` comes off the limit.
function limit(side, width, height, oppositePixels) {
  var size = isHorizontal(side) ? height : width
  if (!(size > 0)) return 4000
  return Math.max(0, Math.floor(size * 0.9) - pixels(oppositePixels))
}

// Applies the same budget to a whole entry, for values that never went
// through the panel: hand edits, or a monitor that changed to a smaller mode.
// The first edge of each pair keeps what it can and the second gets the rest.
function fit(entry, width, height) {
  var result = Object.assign({}, entry)
  var pairs = [["top", "bottom"], ["left", "right"]]
  for (var i = 0; i < pairs.length; i++) {
    var first = pairs[i][0], second = pairs[i][1]
    result[first] = Math.min(pixels(result[first]), limit(first, width, height, 0))
    result[second] = Math.min(pixels(result[second]), limit(second, width, height, result[first]))
  }
  return result
}

function snap(value, grid) {
  return grid > 1 ? Math.round(value / grid) * grid : Math.round(value)
}

// Converts a drag in the monitor preview into a reservation for `side`:
// the value at press time plus the pointer's travel towards the middle.
// `scale` is preview pixels per screen pixel.
function fromDrag(side, start, dx, dy, scale, grid, max) {
  if (!(scale > 0)) return clamp(pixels(start), 0, max)
  var inward = side === "top" ? dy
    : side === "bottom" ? -dy
    : side === "left" ? dx
    : -dx
  return clamp(snap(pixels(start) + inward / scale, grid), 0, max)
}

function nudge(value, delta, max) {
  return clamp(pixels(value) + delta, 0, max)
}

// Whole wheel notches (120 units each) in `rest`, which accumulates
// angleDelta; touchpads send many small deltas that add up to one notch.
function notches(rest) {
  return rest < 0 ? Math.ceil(rest / 120) : Math.floor(rest / 120)
}

// Storage key per connector name. Connector names such as DP-4 can swap
// between boots behind a dock, so a monitor is keyed by its description
// (make, model and serial) when that is known and unique among the connected
// monitors, and by its connector name otherwise. `monitors` holds
// { name, description } pairs.
function outputKeys(monitors) {
  var counts = {}
  var keys = {}
  var i, description
  for (i = 0; i < monitors.length; i++) {
    description = String(monitors[i].description || "").trim()
    if (description) counts[description] = (counts[description] || 0) + 1
  }
  for (i = 0; i < monitors.length; i++) {
    var name = String(monitors[i].name || "")
    description = String(monitors[i].description || "").trim()
    if (name) keys[name] = description && counts[description] === 1 ? description : name
  }
  return keys
}
