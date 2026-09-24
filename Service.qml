import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

// Reads ~/.config/omarchy/display-reserve.json and renders black, inert caps
// over every requested edge. Hyprland reserves matching work areas separately.
Item {
  id: root

  readonly property string statePath: Quickshell.env("HOME") + "/.config/omarchy/display-reserve.json"
  property var reservations: ({})

  function reloadState() {
    try {
      var parsed = JSON.parse(stateFile.text())
      reservations = parsed && parsed.outputs ? parsed.outputs : ({})
    } catch (error) {
      console.warn("display-reserve: invalid state file: " + error)
      reservations = ({})
    }
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: true
    printErrors: false
    onLoaded: root.reloadState()
    onLoadFailed: root.reservations = ({})
  }

  Variants {
    model: Quickshell.screens

    delegate: Item {
      id: delegateRoot
      required property var modelData
      readonly property var edge: root.reservations[modelData.name] || ({})
      readonly property int edgeTop: Math.max(0, Number(edge.top || 0))
      readonly property int edgeBottom: Math.max(0, Number(edge.bottom || 0))
      readonly property int edgeLeft: Math.max(0, Number(edge.left || 0))
      readonly property int edgeRight: Math.max(0, Number(edge.right || 0))

      component BlackCap: PanelWindow {
        color: "black"
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "pym-display-reserve"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
        MouseArea { anchors.fill: parent }
      }

      BlackCap {
        screen: modelData
        visible: delegateRoot.edgeTop > 0
        anchors { top: true; left: true; right: true }
        implicitHeight: delegateRoot.edgeTop
      }
      BlackCap {
        screen: modelData
        visible: delegateRoot.edgeBottom > 0
        anchors { bottom: true; left: true; right: true }
        implicitHeight: delegateRoot.edgeBottom
      }
      BlackCap {
        screen: modelData
        visible: delegateRoot.edgeLeft > 0
        anchors { top: true; bottom: true; left: true }
        implicitWidth: delegateRoot.edgeLeft
      }
      BlackCap {
        screen: modelData
        visible: delegateRoot.edgeRight > 0
        anchors { top: true; bottom: true; right: true }
        implicitWidth: delegateRoot.edgeRight
      }
    }
  }
}
