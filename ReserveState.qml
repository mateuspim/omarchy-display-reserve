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
  readonly property var keys: {
    var monitors = Hyprland.monitors.values
    var pairs = []
    for (var i = 0; i < monitors.length; i++)
      pairs.push({ name: monitors[i].name, description: monitors[i].description })
    return Model.outputKeys(pairs)
  }

  // Texts this instance wrote recently. The watcher reports our own writes
  // too, sometimes late and out of order; a reload that matches one of them
  // is an echo, not a hand edit, and must not roll the state back.
  property var written: []

  function keyFor(output) { return keys[output] || output }
  function entry(output) {
    var key = keyFor(output)
    return outputs[key] !== undefined ? outputs[key] : outputs[output]
  }

  // Stored values, including those of a paused output.
  function edges(output) { return Model.normalize(entry(output)) }
  // What the service draws and Hyprland reserves right now.
  function activeEdges(output) { return Model.active(entry(output)) }
  function isReserved(output) { return Model.total(edges(output)) > 0 }
  function isActive(output) { return Model.total(activeEdges(output)) > 0 }

  function update(output, change) {
    if (!output) return
    var next = Object.assign({}, outputs)
    var key = keyFor(output)
    next[key] = Object.assign(edges(output), change)
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

  function save() {
    saveTimer.stop()
    var text = JSON.stringify({ outputs: outputs }, null, 2) + "\n"
    written = written.concat([text]).slice(-8)
    file.setText(text)
  }

  // Writes a pending edit now instead of after the debounce. The panel calls
  // this when it closes, so an edit is on disk before the shell can restart.
  function flush() { if (saveTimer.running) save() }

  function parse() {
    // A reload that races a pending save would roll the UI back a step.
    if (saveTimer.running) return
    var text = file.text()
    if (written.indexOf(text) !== -1) return
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
    onLoadFailed: if (!saveTimer.running) root.outputs = ({})
  }

  property Timer saveTimer: Timer {
    interval: 200
    onTriggered: root.save()
  }
}
