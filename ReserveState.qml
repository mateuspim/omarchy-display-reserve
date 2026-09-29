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

  function clear(output) {
    var key = keyFor(output)
    if (outputs[key] === undefined && outputs[output] === undefined) return
    var next = Object.assign({}, outputs)
    delete next[key]
    delete next[output]
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
    var text = JSON.stringify({ outputs: outputs }, null, 2) + "\n"
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
    }
  }

  property Timer applyTimer: Timer {
    interval: 100
    onTriggered: if (!root.holding && root.applied !== root.outputs) root.apply()
  }

  property Timer saveTimer: Timer {
    interval: 200
    onTriggered: root.save()
  }
}
