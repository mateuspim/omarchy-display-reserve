import QtQuick
import Quickshell
import qs.Ui
import qs.Commons
import "." as Reserve

// Bar button plus popout for editing reserved display edges. Edits go
// straight into ReserveState, so the caps, the bar and tiled windows move
// while the numbers change; there is nothing to apply.
Panel {
  id: root
  moduleName: "pym.display-reserve"
  manageIpc: false

  readonly property var reserve: Reserve.ReserveState
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var barScreen: button.QsWindow.window ? button.QsWindow.window.screen : null
  readonly property var screenNames: {
    var names = []
    for (var i = 0; i < Quickshell.screens.length; i++) {
      var name = String(Quickshell.screens[i].name || "")
      if (name) names.push(name)
    }
    return names
  }

  // The panel edits the monitor its bar sits on until another is picked.
  property string pickedOutput: ""
  readonly property string output: screenNames.indexOf(pickedOutput) !== -1
    ? pickedOutput
    : (barScreen ? String(barScreen.name) : (screenNames[0] || ""))
  readonly property var outputScreen: {
    for (var i = 0; i < Quickshell.screens.length; i++)
      if (Quickshell.screens[i].name === output) return Quickshell.screens[i]
    return null
  }
  readonly property var edge: reserve.edges(output)
  readonly property bool reserved: reserve.isReserved(output)

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) Qt.callLater(function() { keySurface.forceActiveFocus() })

  function summary(edge) {
    var parts = []
    for (var i = 0; i < reserve.edgeNames.length; i++) {
      var name = reserve.edgeNames[i]
      if (edge[name] > 0) parts.push(name.charAt(0).toUpperCase() + name.slice(1) + " " + edge[name] + " px")
    }
    return parts.length ? parts.join("  ·  ") : "No reserved edges"
  }

  // Never let a typo swallow the whole monitor: at least a tenth of each
  // axis stays usable, so the bar and this panel remain reachable.
  function limit(side) {
    if (!outputScreen) return 4000
    var size = side === "top" || side === "bottom" ? outputScreen.height : outputScreen.width
    return Math.floor(size * 0.9)
  }

  BarIconButton {
    id: button
    bar: root.bar
    text: "󰍹"
    active: root.opened || root.reserved
    tooltipText: root.output + " · " + root.summary(root.edge)
    Accessible.role: Accessible.Button
    Accessible.name: "Display Reserve"
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.toggle()
    }
  }

  KeyboardPanel {
    id: popup
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keySurface
    contentWidth: fittedContentWidth(Style.space(340))
    contentHeight: fittedContentHeight(content.implicitHeight)

    Item {
      id: keySurface
      anchors.fill: parent
      focus: root.opened
      Keys.onPressed: function(event) {
        if (outputPicker.popupOpen) return
        if (event.key === Qt.Key_Escape || event.text === "q") { root.close(); event.accepted = true }
      }

      Column {
        id: content
        width: popup.contentWidth - popup.padding * 2
        spacing: Style.spacing.lg

        PanelHero {
          width: parent.width
          title: "Display Reserve"
          meta: root.summary(root.edge)
          detail: "Black edges block input; the bar and windows stay inside"
          foreground: root.foreground
          fontFamily: root.fontFamily
          iconComponent: Component {
            Text { text: "󰍹"; color: root.reserved ? Color.accent : root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.display }
          }
        }

        Column {
          width: parent.width
          spacing: Style.spacing.xs
          PanelSectionHeader { text: "MONITOR"; foreground: root.foreground; fontFamily: root.fontFamily }
          Dropdown {
            id: outputPicker
            width: parent.width
            showLabel: false
            value: root.output
            options: root.screenNames.map(function(name) {
              return { value: name, label: root.reserve.isReserved(name) ? name + "  ·  reserved" : name }
            })
            foreground: root.foreground
            fontFamily: root.fontFamily
            onChanged: function(value) { root.pickedOutput = value; keySurface.forceActiveFocus() }
          }
        }

        Column {
          width: parent.width
          spacing: Style.spacing.xs
          PanelSectionHeader { text: "RESERVED EDGES  ·  PX"; foreground: root.foreground; fontFamily: root.fontFamily }
          Grid {
            id: edgeGrid
            width: parent.width
            columns: 2
            columnSpacing: Style.spacing.md
            rowSpacing: Style.spacing.sm
            Repeater {
              model: root.reserve.edgeNames
              NumberField {
                required property string modelData
                label: modelData.charAt(0).toUpperCase() + modelData.slice(1)
                fieldWidth: (edgeGrid.width - edgeGrid.columnSpacing) / 2
                from: 0
                to: root.limit(modelData)
                stepSize: 10
                value: root.edge[modelData]
                foreground: root.foreground
                fontFamily: root.fontFamily
                onModified: function(value) { root.reserve.setEdge(root.output, modelData, value) }
              }
            }
          }
        }

        Button {
          width: parent.width
          text: "Clear " + root.output
          iconText: "󰅖"
          enabled: root.reserved
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: { root.reserve.clear(root.output); keySurface.forceActiveFocus() }
        }
      }
    }
  }
}
