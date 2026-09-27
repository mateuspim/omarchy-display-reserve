pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Shared reservation state for the service (black caps) and every bar widget
// instance. Edits land here first so all surfaces update in the same frame;
// the JSON file is only persistence and a hook for hand edits.
QtObject {
  id: root

  readonly property string path: Quickshell.env("HOME") + "/.config/omarchy/display-reserve.json"
  readonly property var edgeNames: ["top", "bottom", "left", "right"]
  property var outputs: ({})

  function edges(output) {
    var edge = outputs[output] || {}
    var result = {}
    for (var i = 0; i < edgeNames.length; i++)
      result[edgeNames[i]] = Math.max(0, Math.round(Number(edge[edgeNames[i]] || 0)))
    return result
  }

  function isReserved(output) {
    var edge = edges(output)
    return edge.top + edge.bottom + edge.left + edge.right > 0
  }

  function setEdge(output, name, pixels) {
    if (!output || edgeNames.indexOf(name) === -1) return
    var next = Object.assign({}, outputs)
    var edge = edges(output)
    edge[name] = Math.max(0, Math.round(Number(pixels) || 0))
    next[output] = edge
    outputs = next
    saveTimer.restart()
  }

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
