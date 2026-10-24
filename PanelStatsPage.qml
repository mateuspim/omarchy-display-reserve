import QtQuick
import qs.Ui
import qs.Commons
import "Model.js" as Model
import "StatsViews.js" as Views

// The panel's Stats page: which panels this monitor's dashboard shows, in
// which order, and the settings every dashboard shares. Without the Stats
// fill there is nothing to arrange, so it offers to switch to it.
Column {
  id: page
  // The Panel this page edits: its monitor, edges and edit functions.
  required property var panel
  readonly property var shown: panel.edge.panels
  readonly property var hidden: Model.panelOrder(shown).slice(shown.length)
  readonly property bool active: panel.edge.fill === "stats"
  spacing: Style.spacing.sm

  // --- not the stats fill ----------------------------------------------------
  Text {
    visible: !page.active
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "This monitor's edges don't show the stats dashboard. Switch its fill to Stats to pick and arrange the panels."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
  Button {
    visible: !page.active
    width: parent.width
    text: "Use the Stats fill"
    iconText: "󰨇"
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    onClicked: { page.panel.setFill("stats"); page.panel.refocus() }
  }

  // --- the panels shown, in order -------------------------------------------
  PanelSectionHeader {
    visible: page.active
    text: "SHOWN  ·  " + page.shown.length + " OF " + Model.STATS_PANELS.length
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Text {
    visible: page.active && page.shown.length > 1
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "In this order; panels that don't fit the edge are left off from the end."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
  Repeater {
    model: page.active ? page.shown : []
    Item {
      id: shownRow
      required property string modelData
      required property int index
      width: page.width
      height: hideButton.implicitHeight
      Button {
        id: hideButton
        anchors.left: parent.left
        anchors.right: upButton.left
        anchors.rightMargin: Style.spacing.md
        leftAlign: true
        text: (shownRow.index + 1) + "  " + Model.panelName(shownRow.modelData)
        iconText: Views.ICONS[shownRow.modelData]
        selected: true
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: "Hide " + Model.panelName(shownRow.modelData).toLowerCase() + " from the dashboard\nRight click for every monitor"
        onClicked: { page.panel.togglePanel(shownRow.modelData); page.panel.refocus() }
        onRightClicked: { page.panel.togglePanelEverywhere(shownRow.modelData); page.panel.refocus() }
      }
      Button {
        id: upButton
        anchors.right: downButton.left
        anchors.rightMargin: Style.spacing.md
        iconText: "󰁝"
        enabled: shownRow.index > 0
        opacity: enabled ? 1 : 0.4
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: "Move " + Model.panelName(shownRow.modelData).toLowerCase() + " earlier"
        onClicked: { page.panel.movePanel(shownRow.modelData, -1); page.panel.refocus() }
      }
      Button {
        id: downButton
        anchors.right: parent.right
        iconText: "󰁅"
        enabled: shownRow.index < page.shown.length - 1
        opacity: enabled ? 1 : 0.4
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: "Move " + Model.panelName(shownRow.modelData).toLowerCase() + " later, where it is left off first"
        onClicked: { page.panel.movePanel(shownRow.modelData, 1); page.panel.refocus() }
      }
    }
  }

  // --- the panels to add -----------------------------------------------------
  Item { visible: page.active && page.hidden.length > 0; width: 1; height: Style.spacing.sm }
  PanelSectionHeader {
    visible: page.active && page.hidden.length > 0
    text: "ADD"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Flow {
    id: addGrid
    visible: page.active && page.hidden.length > 0
    width: parent.width
    property int columns: 3
    spacing: Style.spacing.md
    Repeater {
      model: page.active ? page.hidden : []
      Button {
        required property string modelData
        required property int index
        readonly property int cells: Model.rowCells(page.hidden.length, addGrid.columns, index)
        width: Math.floor((addGrid.width - addGrid.spacing * (cells - 1)) / cells)
        text: Model.panelName(modelData)
        iconText: Views.ICONS[modelData]
        horizontalPadding: Style.spacing.sm
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        tooltipText: "Show " + Model.panelName(modelData).toLowerCase() + " last on the dashboard\nRight click for every monitor"
        onClicked: { page.panel.togglePanel(modelData); page.panel.refocus() }
        onRightClicked: { page.panel.togglePanelEverywhere(modelData); page.panel.refocus() }
      }
    }
  }

  // --- every dashboard -------------------------------------------------------
  Item { width: 1; height: Style.spacing.sm }
  PanelSectionHeader {
    text: "EVERY MONITOR"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  // How smoothly every dashboard moves, against how often it redraws.
  Button {
    width: parent.width
    text: "Animation  ·  " + Model.paceName(page.panel.reserve.statsPace)
    iconText: "󰔛"
    selected: page.panel.reserve.statsPace !== 1
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    tooltipText: "How often the graphs and meters move on every monitor, which is how often the dashboard redraws.\nClick to cycle: display rate, 60, 30, 15 fps, no animation"
    onClicked: { page.panel.reserve.setStatsPace(Model.nextPace(page.panel.reserve.statsPace)); page.panel.refocus() }
  }
  // The CPU's power draw needs its energy counter, which is root's
  // until a udev rule opens it; hidden where there is none.
  Button {
    width: parent.width
    visible: page.panel.reserve.cpuPower === "locked" || page.panel.reserve.cpuPower === "on"
    text: "CPU power  ·  " + (page.panel.reserve.cpuPower === "on" ? "On" : "Enable")
    iconText: "󱐋"
    selected: page.panel.reserve.cpuPower === "on"
    bordered: true
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
    tooltipText: page.panel.reserve.cpuPower === "on"
      ? "The CPU panel shows the CPU's power draw.\nClick to lock its energy counter to root again: a terminal shows the commands and asks first"
      : "The CPU's energy counter is root's, so the CPU panel cannot show its power draw.\nClick to open it with a udev rule: a terminal shows the commands and asks first"
    onClicked: { page.panel.reserve.changeCpuPower(page.panel.reserve.cpuPower === "on" ? "disable" : "enable"); page.panel.refocus() }
  }
}
