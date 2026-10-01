pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "Model.js" as Model

// Shared reservation state for the service (black caps) and every bar widget
// instance. Edits land here first so all surfaces update in the same frame;
// the JSON file is only persistence and a hook for hand edits.
//
// Callers name monitors by connector (DP-4). Entries are stored under the
// key from Model.outputKeys, which follows the monitor across connectors;
// entries saved under a connector name are still read and move to the new
// key on the next edit.
QtObject {
  id: root

  readonly property string path: Quickshell.env("HOME") + "/.config/omarchy/display-reserve.json"
  readonly property var edgeNames: Model.EDGES
  property var outputs: ({})
  // Seconds without input before every edge goes black; 0 never does. One
  // setting for the whole session, since idle is.
  property int idleBlack: 0
  // Named snapshots of `outputs` (Model.snapshot), saved beside it.
  property var profiles: ({})
  // The profile `outputs` matches right now, or "".
  readonly property string currentProfile: Model.currentProfile(profiles, outputs)
  // The monitor showing the calibration ruler, or "". Never saved.
  property string ruler: ""

  // What the service draws and Hyprland reserves. It trails `outputs`: every
  // change re-tiles each window on the monitor and moves the bar, so it is
  // applied at most every 100 ms, and not at all while a drag holds it. The
  // panel's preview follows `outputs` and stays live throughout.
  property var applied: ({})
  property bool holding: false
  onOutputsChanged: if (!holding && !applyTimer.running) apply()
  readonly property var keys: {
    var monitors = Hyprland.monitors.values
    var pairs = []
    for (var i = 0; i < monitors.length; i++)
      pairs.push({ name: monitors[i].name, description: monitors[i].description })
    return Model.outputKeys(pairs)
  }

  // Texts this instance wrote in the last few seconds, as { text, time }.
  // The watcher reports our own writes too, sometimes late and out of order;
  // a reload that matches one of them is an echo, not a hand edit, and must
  // not roll the state back. Older texts have long reached the disk, so a
  // file that matches one of them was restored by hand.
  property var written: []
  readonly property int echoWindow: 3000
  function recentWrites() {
    var since = Date.now() - echoWindow
    return written.filter(function(write) { return write.time >= since })
  }

  function keyFor(output) { return keys[output] || output }
  function entryIn(map, output) {
    var key = keyFor(output)
    return map[key] !== undefined ? map[key] : map[output]
  }
  function entry(output) { return entryIn(outputs, output) }

  // Stored values, including those of a paused output.
  function edges(output) { return Model.normalize(entry(output)) }
  // What the service draws and Hyprland reserves right now.
  function activeEdges(output) { return Model.active(entry(output)) }
  // What is on screen now; lags activeEdges while held or throttled.
  function appliedEdges(output) { return Model.active(entryIn(applied, output)) }
  function isReserved(output) { return Model.total(edges(output)) > 0 }
  function isActive(output) { return Model.total(activeEdges(output)) > 0 }

  function update(output, change) {
    if (!output) return
    var key = keyFor(output)
    var current = edges(output)
    var changed = Object.assign({}, current, change)
    // Drags snap to a grid and nudges clamp at the limits, so most calls
    // change nothing. Skip them unless an entry still has to move keys.
    var migrating = key !== output && outputs[output] !== undefined
    if (!migrating && Model.same(current, changed)) return
    var next = Object.assign({}, outputs)
    next[key] = changed
    if (key !== output) delete next[output]
    outputs = next
    saveTimer.restart()
  }

  function setEdge(output, name, pixels) {
    if (edgeNames.indexOf(name) === -1) return
    var change = {}
    change[name] = Model.pixels(pixels)
    update(output, change)
  }

  function setEnabled(output, enabled) { update(output, { enabled: enabled === true }) }

  function setFill(output, fill) {
    if (Model.FILLS.indexOf(fill) === -1) return
    update(output, { fill: fill })
  }

  function setIdleBlack(seconds) {
    var value = Model.idleSeconds(seconds)
    if (value === idleBlack) return
    idleBlack = value
    saveTimer.restart()
  }

  function toggleRuler(output) { ruler = ruler === output ? "" : output }

  // The edges that give `output` a reachable area of `aspect` (a number),
  // aligned by `align`; nothing when the monitor's size is unknown.
  function setAspect(output, width, height, aspect, align) {
    if (!(width > 0 && height > 0 && aspect > 0)) return
    update(output, Object.assign({ enabled: true }, Model.aspectEdges(width, height, aspect, align)))
  }

  function setClockEdge(output, clockEdge) {
    if (Model.CLOCK_EDGES.indexOf(clockEdge) === -1) return
    update(output, { clockEdge: clockEdge })
  }

  // Saves every monitor's entry as profile `name`, replacing one of that
  // name. Returns the name it saved under, or "" for a blank name.
  function saveProfile(name) {
    name = Model.findProfile(profiles, name) || Model.profileName(name)
    if (!name) return ""
    setProfile(name, outputs)
    return name
  }

  // Stores `map` as profile `name` as it is, for saving or undoing a delete.
  function setProfile(name, map) {
    var next = Object.assign({}, profiles)
    next[name] = Model.snapshot(map)
    profiles = next
    saveTimer.restart()
  }

  // Makes the saved entries exactly what profile `name` holds. Returns the
  // profile's name, or "" when there is none by that name.
  function applyProfile(name) {
    name = Model.findProfile(profiles, name)
    if (!name) return ""
    setOutputs(profiles[name])
    return name
  }

  function deleteProfile(name) {
    name = Model.findProfile(profiles, name)
    if (!name) return ""
    var next = Object.assign({}, profiles)
    delete next[name]
    profiles = next
    saveTimer.restart()
    return name
  }

  // Replaces every saved entry at once, for a profile or undoing one.
  function setOutputs(map) {
    if (Model.sameOutputs(map, outputs)) return
    outputs = JSON.parse(JSON.stringify(map || {}))
    saveTimer.restart()
  }

  // Drops the edges but keeps the fill settings: they describe the monitor,
  // not one reservation.
  function clear(output) {
    var key = keyFor(output)
    if (outputs[key] === undefined && outputs[output] === undefined) return
    var current = edges(output)
    var next = Object.assign({}, outputs)
    delete next[key]
    delete next[output]
    if (current.fill !== "black" || current.clockEdge !== "largest")
      next[key] = { fill: current.fill, clockEdge: current.clockEdge }
    outputs = next
    saveTimer.restart()
  }

  function apply() {
    applied = outputs
    applyTimer.restart()
  }

  // Holds the screen at its current reservation while a drag runs; letting
  // go applies the final value at once.
  function hold(on) {
    if (holding === on) return
    holding = on
    if (!on) apply()
  }

  function save() {
    saveTimer.stop()
    var state = { outputs: outputs }
    if (idleBlack) state.idleBlack = idleBlack
    if (Object.keys(profiles).length) state.profiles = profiles
    var text = JSON.stringify(state, null, 2) + "\n"
    written = recentWrites().concat([{ text: text, time: Date.now() }])
    file.setText(text)
  }

  // Writes a pending edit now instead of after the debounce. The panel calls
  // this when it closes, so an edit is on disk before the shell can restart.
  function flush() { if (saveTimer.running) save() }

  function parse() {
    // A reload that races a pending save would roll the UI back a step.
    if (saveTimer.running) return
    var text = file.text()
    // A writer that truncates first leaves the file empty for a moment; the
    // full text follows with its own change event.
    if (text.trim() === "") return
    if (recentWrites().some(function(write) { return write.text === text })) return
    // Someone else wrote the file, so our older texts are no longer echoes;
    // restoring one of them by hand is an edit like any other.
    written = []
    try {
      var parsed = JSON.parse(text)
      outputs = parsed && parsed.outputs ? parsed.outputs : ({})
      idleBlack = Model.idleSeconds(parsed && parsed.idleBlack)
      profiles = Model.profiles(parsed && parsed.profiles)
    } catch (error) {
      console.warn("display-reserve: invalid state file: " + error)
    }
  }

  property FileView file: FileView {
    path: root.path
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.parse()
    // Atomic writes rename over the file, so it never goes missing during
    // our own saves; this only fires when the file is absent or deleted.
    onLoadFailed: if (!saveTimer.running) {
      root.written = []
      root.outputs = ({})
      root.idleBlack = 0
      root.profiles = ({})
    }
  }

  // The image Omarchy's background layer shows, for the wallpaper fill.
  // Omarchy repoints this symlink on every wallpaper or theme change, and
  // inotify would only watch the image it points to, so it is polled, and
  // only while some monitor uses a wallpaper fill.
  readonly property string backgroundLink: Quickshell.env("HOME") + "/.local/state/omarchy/current/background"
  property string wallpaper: ""
  // Only connected monitors count: a saved one that is unplugged shows
  // nothing.
  readonly property bool usesWallpaper: {
    for (var output in keys) if (Model.showsWallpaper(edges(output).fill)) return true
    return false
  }
  onUsesWallpaperChanged: if (usesWallpaper && !wallpaperProc.running) wallpaperProc.running = true

  property Process wallpaperProc: Process {
    command: ["readlink", "-f", root.backgroundLink]
    stdout: StdioCollector {
      onStreamFinished: {
        var path = String(text || "").trim()
        if (path !== root.wallpaper) root.wallpaper = path
      }
    }
  }

  property Timer wallpaperTimer: Timer {
    interval: 2000
    repeat: true
    running: root.usesWallpaper
    onTriggered: if (!root.wallpaperProc.running) root.wallpaperProc.running = true
  }

  // The Omarchy logo's SVG source, for the logo fill to recolor.
  property FileView logoFile: FileView {
    path: (Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy") + "/logo.svg"
    printErrors: false
    onLoaded: root.logoSvg = text()
  }
  property string logoSvg: ""

  // Omarchy's square icon as block art, drawn over the wordmark on the
  // side edges.
  property FileView iconFile: FileView {
    path: (Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy") + "/icon.txt"
    printErrors: false
    onLoaded: root.iconArt = Model.blockBitmap(text())
  }
  property var iconArt: null

  property Timer applyTimer: Timer {
    interval: 100
    onTriggered: if (!root.holding && root.applied !== root.outputs) root.apply()
  }

  property Timer saveTimer: Timer {
    interval: 200
    onTriggered: root.save()
  }
}
