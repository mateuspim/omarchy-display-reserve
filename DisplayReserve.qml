import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

Item {
  id: root
  property var bar: null
  property bool opened: false
  property string output: "DP-4"
  property int topPixels: 480
  property int bottomPixels: 0
  property int leftPixels: 0
  property int rightPixels: 0
  property string status: ""
  readonly property string statePath: Quickshell.env("HOME") + "/.config/omarchy/display-reserve.json"
  readonly property string helperPath: Quickshell.env("HOME") + "/.config/omarchy/plugins/pym.display-reserve/set-reserve"
  implicitWidth: 28
  implicitHeight: 26

  function open() { opened = true; stateFile.reload() }
  function close() { opened = false }
  function toggle() { opened ? close() : open() }
  function closeForPopoutSwitch() { close() }
  function readState() {
    try {
      var parsed = JSON.parse(stateFile.text())
      var edge = parsed.outputs && parsed.outputs[output] ? parsed.outputs[output] : ({})
      topPixels = Number(edge.top || 0); bottomPixels = Number(edge.bottom || 0)
      leftPixels = Number(edge.left || 0); rightPixels = Number(edge.right || 0)
      status = ""
    } catch (error) { status = "Could not read saved settings" }
  }
  function apply() {
    applyProcess.command = [helperPath, output, "--top", String(topPixels), "--bottom", String(bottomPixels), "--left", String(leftPixels), "--right", String(rightPixels)]
    status = "Applying…"; applyProcess.running = true
  }

  Rectangle { anchors.fill: parent; color: mouse.containsMouse ? "#ffffff22" : "transparent"; radius: 4 }
  Text { anchors.centerIn: parent; text: "▣"; color: "white"; font.pixelSize: 17 }
  MouseArea { id: mouse; anchors.fill: parent; hoverEnabled: true; onClicked: root.toggle() }

  FileView { id: stateFile; path: root.statePath; printErrors: false; onLoaded: root.readState() }
  Process {
    id: applyProcess
    onExited: function(code) { root.status = code === 0 ? "Applied" : "Could not apply changes"; if (code === 0) stateFile.reload() }
  }

  PanelWindow {
    id: window
    screen: Quickshell.screens.length ? Quickshell.screens[0] : null
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "pym-display-reserve-controls"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    Rectangle { anchors.fill: parent; color: "#00000099"; MouseArea { anchors.fill: parent; onClicked: root.close() } }
    Rectangle {
      anchors.centerIn: parent
      width: 440; height: content.implicitHeight + 40
      color: "#202124"; radius: 12; border.color: "#ffffff33"
      ColumnLayout {
        id: content
        anchors { fill: parent; margins: 20 }
        spacing: 14
        Text { text: "Display Reserve · " + root.output; color: "white"; font.pixelSize: 20; font.bold: true }
        Text { text: "Reserve black, unreachable edges in pixels"; color: "#c9c9c9" }
        GridLayout {
          Layout.fillWidth: true; columns: 2; columnSpacing: 18; rowSpacing: 10
          Repeater {
            model: [{label:"Top", key:"topPixels"}, {label:"Bottom", key:"bottomPixels"}, {label:"Left", key:"leftPixels"}, {label:"Right", key:"rightPixels"}]
            delegate: ColumnLayout {
              required property var modelData
              Text { text: modelData.label; color: "#dddddd" }
              SpinBox {
                from: 0; to: 3000; stepSize: 10; editable: true
                value: root[modelData.key]
                onValueModified: root[modelData.key] = value
                Layout.preferredWidth: 180
              }
            }
          }
        }
        Text { text: root.status; visible: text !== ""; color: root.status === "Applied" ? "#8bd450" : "#ffcf66" }
        RowLayout {
          Layout.fillWidth: true
          Item { Layout.fillWidth: true }
          Button { text: "Close"; onClicked: root.close() }
          Button { text: applyProcess.running ? "Applying…" : "Apply"; enabled: !applyProcess.running; onClicked: root.apply() }
        }
      }
    }
  }
}
