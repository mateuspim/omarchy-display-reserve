pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Shared reservation state for the service (black caps) and every bar widget
// instance. Edits land here first so all surfaces update in the same frame;
// the JSON file is only persistence and a hook for hand edits.
QtObject {
  id: root

  readonly property string path: Quickshell.env("HOME") + "/.config/omarchy/display-reserve.json"
  readonly property var edgeNames: Model.EDGES
  property var outputs: ({})

  // Stored values, including those of a paused output.
  function edges(output) { return Model.normalize(outputs[output]) }
  // What the service draws and Hyprland reserves right now.
  function activeEdges(output) { return Model.active(outputs[output]) }
  function isReserved(output) { return Model.total(edges(output)) > 0 }
  function isActive(output) { return Model.total(activeEdges(output)) > 0 }

  function update(output, change) {
    if (!output) return
    var next = Object.assign({}, outputs)
    next[output] = Object.assign(edges(output), change)
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
    if (!outputs[output]) return
    var next = Object.assign({}, outputs)
    delete next[output]
    outputs = next
    saveTimer.restart()
  }

  function parse() {
    // A reload that races a pending save would roll the UI back a step.
    if (saveTimer.running) return
    try {
      var parsed = JSON.parse(file.text())
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
    onLoadFailed: if (!saveTimer.running) root.outputs = ({})
  }

  property Timer saveTimer: Timer {
    interval: 200
    onTriggered: root.file.setText(JSON.stringify({ outputs: root.outputs }, null, 2) + "\n")
  }
}
