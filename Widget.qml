import QtQuick
import QtQuick.Layouts
import Quickshell.Io
import qs.Commons
import qs.Ui as Ui

Ui.BarWidget {
  id: root
  moduleName: "pym.display-reserve"
  property bool opened: false

  property string output: "DP-4"
  property int topPixels: 480
  property int bottomPixels: 0
  property int leftPixels: 0
  property int rightPixels: 0
  property string status: ""
  readonly property string statePath: Quickshell.env("HOME") + "/.config/omarchy/display-reserve.json"
  readonly property string helperPath: Quickshell.env("HOME") + "/.config/omarchy/plugins/pym.display-reserve/set-reserve"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function open() { opened = true }
  function close() { opened = false }
  function toggle() { opened = !opened }
  function closeForPopoutSwitch() { close() }

  function readState() {
    try {
      var parsed = JSON.parse(stateFile.text())
      var edge = parsed.outputs && parsed.outputs[output] ? parsed.outputs[output] : ({})
      topPixels = Number(edge.top || 0)
      bottomPixels = Number(edge.bottom || 0)
      leftPixels = Number(edge.left || 0)
      rightPixels = Number(edge.right || 0)
      status = ""
    } catch (error) {
      status = "Could not read saved display settings"
    }
  }

  function apply() {
    applyProcess.command = [helperPath, output, "--top", String(topPixels), "--bottom", String(bottomPixels), "--left", String(leftPixels), "--right", String(rightPixels)]
    applyProcess.running = true
    status = "Applying…"
  }

  onOpenedChanged: if (opened) stateFile.reload()

  FileView {
    id: stateFile
    path: root.statePath
    printErrors: false
    onLoaded: root.readState()
  }

  Process {
    id: applyProcess
    onExited: function(exitCode) {
      status = exitCode === 0 ? "Applied" : "Could not apply changes"
      if (exitCode === 0) stateFile.reload()
    }
  }

  Ui.BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰍹"
    tooltipText: "Display Reserve"
    active: root.opened
    onPressed: root.toggle()
  }

  Ui.KeyboardPanel {
    id: popup
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    contentWidth: fittedContentWidth(420)
    contentHeight: fittedContentHeight(content.implicitHeight)

    ColumnLayout {
      id: content
      anchors.fill: parent
      spacing: Style.spacing.lg

      Ui.Label {
        text: "Display Reserve · " + root.output
        font.bold: true
        font.pixelSize: Style.font.title
      }
      Ui.Label {
        Layout.fillWidth: true
        text: "Black out and reserve unreachable edges (pixels)."
        wrapMode: Text.WordWrap
        color: Qt.darker(Color.foreground, 1.4)
      }
      GridLayout {
        Layout.fillWidth: true
        columns: 2
        columnSpacing: Style.spacing.lg
        rowSpacing: Style.spacing.md
        Ui.NumberField { label: "Top"; value: root.topPixels; to: 3000; stepSize: 10; onModified: root.topPixels = value }
        Ui.NumberField { label: "Bottom"; value: root.bottomPixels; to: 3000; stepSize: 10; onModified: root.bottomPixels = value }
        Ui.NumberField { label: "Left"; value: root.leftPixels; to: 3000; stepSize: 10; onModified: root.leftPixels = value }
        Ui.NumberField { label: "Right"; value: root.rightPixels; to: 3000; stepSize: 10; onModified: root.rightPixels = value }
      }
      Ui.Label {
        Layout.fillWidth: true
        visible: root.status !== ""
        text: root.status
        color: root.status === "Applied" ? Color.accent : Color.foreground
      }
      RowLayout {
        Layout.fillWidth: true
        Item { Layout.fillWidth: true }
        Ui.Button {
          text: "Reset"
          bordered: true
          onClicked: { root.topPixels = 0; root.bottomPixels = 0; root.leftPixels = 0; root.rightPixels = 0 }
        }
        Ui.Button {
          text: applyProcess.running ? "Applying…" : "Apply"
          enabled: !applyProcess.running
          active: true
          onClicked: root.apply()
        }
      }
    }
  }
}
