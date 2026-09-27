.pragma library

var EDGES = ["top", "bottom", "left", "right"]

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
  var result = { enabled: entry.enabled !== false }
  for (var i = 0; i < EDGES.length; i++) result[EDGES[i]] = pixels(entry[EDGES[i]])
  return result
}

// What is actually on screen: a paused output reserves nothing.
function active(raw) {
  var entry = normalize(raw)
  if (!entry.enabled) for (var i = 0; i < EDGES.length; i++) entry[EDGES[i]] = 0
  return entry
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
  return (entry.enabled === false ? "Paused  ·  " : "") + parts.join("  ·  ")
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
