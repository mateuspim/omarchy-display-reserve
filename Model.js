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
// usable, so the bar and the panel remain reachable.
function limit(side, width, height) {
  var size = isHorizontal(side) ? height : width
  return size > 0 ? Math.floor(size * 0.9) : 4000
}

function snap(value, grid) {
  return grid > 1 ? Math.round(value / grid) * grid : Math.round(value)
}

// Converts a pointer position inside the monitor preview into a reservation
// for `side`. `scale` is preview pixels per screen pixel.
function fromPointer(side, x, y, previewWidth, previewHeight, scale, grid, max) {
  if (!(scale > 0)) return 0
  var distance = side === "top" ? y
    : side === "bottom" ? previewHeight - y
    : side === "left" ? x
    : previewWidth - x
  return clamp(snap(distance / scale, grid), 0, max)
}

function nudge(value, delta, max) {
  return clamp(pixels(value) + delta, 0, max)
}
