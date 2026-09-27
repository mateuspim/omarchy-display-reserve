import QtQuick
import Quickshell
import qs.Ui
import qs.Commons
import "." as Reserve
import "Model.js" as Model

// Bar button plus popout for editing reserved display edges. Edits go
// straight into ReserveState, so the caps, the bar and tiled windows move
// while you drag; there is nothing to apply.
Panel {
  id: root
  moduleName: "pym.display-reserve"
  manageIpc: false

  readonly property var reserve: Reserve.ReserveState
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color subtle: Qt.darker(foreground, 1.45)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var barWindow: button.QsWindow.window
  readonly property string barOutput: barWindow && barWindow.screen ? String(barWindow.screen.name) : ""
  readonly property string barPosition: bar && bar.position ? bar.position : "top"
  readonly property real barThickness: !barWindow ? 26
    : (barPosition === "left" || barPosition === "right" ? barWindow.width : barWindow.height)

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
    : (barOutput || screenNames[0] || "")
  readonly property var outputScreen: {
    for (var i = 0; i < Quickshell.screens.length; i++)
      if (Quickshell.screens[i].name === output) return Quickshell.screens[i]
    return null
  }
  readonly property var edge: reserve.edges(output)
  readonly property bool reserved: reserve.isReserved(output)

  // Keyboard cursor over the four edge rows.
  property int cursor: 0
  readonly property string cursorEdge: reserve.edgeNames[cursor]

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: {
    if (!opened) return
    pickedOutput = ""
    Qt.callLater(function() { keySurface.forceActiveFocus() })
  }

  function limit(side) {
    return Model.limit(side, outputScreen ? outputScreen.width : 0, outputScreen ? outputScreen.height : 0)
  }
  function setEdge(side, pixels) {
    reserve.setEdge(output, side, Model.clamp(Model.pixels(pixels), 0, limit(side)))
  }
  function nudge(side, delta) {
    reserve.setEdge(output, side, Model.nudge(edge[side], delta, limit(side)))
  }
  function toggleEnabled(name) {
    if (reserve.isReserved(name)) reserve.setEnabled(name, !reserve.edges(name).enabled)
  }
  function cycleOutput(direction) {
    if (screenNames.length < 2) return
    var index = screenNames.indexOf(output)
    pickedOutput = screenNames[(index + direction + screenNames.length) % screenNames.length]
  }

  function handleKey(event) {
    if (event.key === Qt.Key_Escape || event.text === "q") { root.close(); event.accepted = true; return }
    var shift = event.modifiers & Qt.ShiftModifier
    var step = shift ? 100 : (event.modifiers & Qt.ControlModifier ? 1 : 10)
    var key = event.key
    if (key === Qt.Key_Up || key === Qt.Key_K) cursor = Math.max(0, cursor - 1)
    else if (key === Qt.Key_Down || key === Qt.Key_J) cursor = Math.min(reserve.edgeNames.length - 1, cursor + 1)
    else if (key === Qt.Key_Left || key === Qt.Key_H) nudge(cursorEdge, -step)
    else if (key === Qt.Key_Right || key === Qt.Key_L) nudge(cursorEdge, step)
    else if (key === Qt.Key_0 || key === Qt.Key_Backspace || key === Qt.Key_Delete) setEdge(cursorEdge, 0)
    else if (key === Qt.Key_Tab) cycleOutput(shift ? -1 : 1)
    else if (key === Qt.Key_Backtab) cycleOutput(-1)
    else if (key === Qt.Key_Space || key === Qt.Key_P) toggleEnabled(output)
    else return
    event.accepted = true
  }

  BarIconButton {
    id: button
    bar: root.bar
    text: "󰍹"
    active: root.opened || root.reserve.isActive(root.barOutput)
    tooltipText: root.barOutput + "  ·  " + Model.summary(root.reserve.edges(root.barOutput))
      + (root.reserve.isReserved(root.barOutput) ? "\nRight click to " + (root.reserve.edges(root.barOutput).enabled ? "pause" : "resume") : "")
    Accessible.role: Accessible.Button
    Accessible.name: "Display Reserve"
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.toggle()
      else if (mouseButton === Qt.RightButton) root.toggleEnabled(root.barOutput)
    }
  }

  KeyboardPanel {
    id: popup
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keySurface
    contentWidth: fittedContentWidth(Style.space(380))
    contentHeight: fittedContentHeight(content.implicitHeight)

    // KeyboardPanel measures the card's distance from the screen edge,
    // assuming the bar sits there. A reserved edge pushes the bar inwards,
    // so widen the gap by the same amount: the card opens beside the bar
    // instead of inside the black cap, and the click-through bar strip
    // grows to cover the moved bar.
    gap: Style.gapsOut + root.reserve.activeEdges(root.barOutput)[root.barPosition]

    Item {
      id: keySurface
      anchors.fill: parent
      focus: root.opened
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) { root.handleKey(event) }

      Column {
        id: content
        width: popup.contentWidth - popup.padding * 2
        spacing: Style.spacing.lg

        PanelHero {
          width: parent.width
          title: "Display Reserve"
          meta: Model.summary(root.edge)
          foreground: root.foreground
          fontFamily: root.fontFamily
          iconComponent: Component {
            Text {
              text: "󰍹"
              color: root.reserve.isActive(root.output) ? Color.accent : root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
            }
          }
          trailingControl: Component {
            ToggleSwitch {
              checked: root.reserve.isActive(root.output)
              interactive: root.reserved
              opacity: root.reserved ? 1 : 0.4
              foreground: root.foreground
              onToggled: { root.toggleEnabled(root.output); keySurface.forceActiveFocus() }
            }
          }
        }

        // Equal-width monitor buttons. Every button carries an icon so they
        // share one height; the glyph says whether that monitor is reserved.
        Row {
          id: monitorRow
          visible: root.screenNames.length > 1
          width: parent.width
          spacing: Style.spacing.md
          Repeater {
            model: root.screenNames
            Button {
              required property string modelData
              width: (monitorRow.width - monitorRow.spacing * (root.screenNames.length - 1)) / root.screenNames.length
              text: modelData
              iconText: root.reserve.isActive(modelData) ? "󰍹" : "󰶐"
              tooltipText: modelData + "  ·  " + Model.summary(root.reserve.edges(modelData))
              selected: modelData === root.output
              bordered: true
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: { root.pickedOutput = modelData; keySurface.forceActiveFocus() }
            }
          }
        }

        MonitorPreview {
          width: parent.width
          height: Style.space(200)
        }

        Column {
          width: parent.width
          spacing: Style.spacing.sm
          PanelSectionHeader {
            text: "EDGES  ·  J / K  ·  H / L"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }
          Repeater {
            model: root.reserve.edgeNames
            EdgeRow { width: parent.width }
          }
        }

        Item {
          width: parent.width
          height: clearButton.implicitHeight
          Text {
            anchors.left: parent.left
            anchors.right: clearButton.left
            anchors.rightMargin: Style.spacing.md
            anchors.verticalCenter: parent.verticalCenter
            text: "⇧ ×10  ·  0 zero  ·  Space pause"
            color: root.subtle
            elide: Text.ElideRight
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
          Button {
            id: clearButton
            anchors.right: parent.right
            text: "Clear"
            iconText: "󰅖"
            enabled: root.reserved
            opacity: enabled ? 1 : 0.4
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            tooltipText: "Remove every reserved edge on " + root.output
            onClicked: { root.reserve.clear(root.output); keySurface.forceActiveFocus() }
          }
        }
      }
    }
  }

  // One edge: name, a slider for quick moves and a field for exact pixels.
  component EdgeRow: Item {
    id: row
    required property string modelData
    required property int index
    readonly property bool selected: root.cursor === index
    readonly property int value: root.edge[modelData]
    implicitHeight: Math.max(field.implicitHeight, slider.implicitHeight)

    Text {
      id: label
      width: Style.space(58)
      anchors.verticalCenter: parent.verticalCenter
      text: Model.title(row.modelData)
      color: row.selected ? Color.accent : (row.value > 0 ? root.foreground : root.subtle)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    PanelSlider {
      id: slider
      bar: root.bar
      anchors.left: label.right
      anchors.right: field.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      minimum: 0
      maximum: root.limit(row.modelData)
      step: 10
      integer: true
      value: row.value
      fillColor: row.selected ? Color.accent : root.foreground
      knobColor: fillColor
      onMoved: function(value) { root.cursor = row.index; root.setEdge(row.modelData, value) }
      onReleased: keySurface.forceActiveFocus()
    }
    NumberField {
      id: field
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      fieldWidth: Style.space(96)
      from: 0
      to: root.limit(row.modelData)
      stepSize: 10
      value: row.value
      hasCursor: row.selected
      foreground: root.foreground
      fontFamily: root.fontFamily
      onModified: function(value) { root.cursor = row.index; root.setEdge(row.modelData, value) }
    }
  }

  // The selected monitor to scale: black reserved edges, the reachable area,
  // where the bar will sit, and a draggable handle on every edge.
  component MonitorPreview: Item {
    id: preview
    readonly property real screenWidth: root.outputScreen ? root.outputScreen.width : 16
    readonly property real screenHeight: root.outputScreen ? root.outputScreen.height : 9
    readonly property real scale: Math.min(width / screenWidth, (height - caption.height - Style.spacing.sm) / screenHeight)
    readonly property bool paused: !root.edge.enabled
    readonly property real reachWidth: screenWidth - root.edge.left - root.edge.right
    readonly property real reachHeight: screenHeight - root.edge.top - root.edge.bottom

    Rectangle {
      id: monitor
      anchors.horizontalCenter: parent.horizontalCenter
      width: Math.round(preview.screenWidth * preview.scale)
      height: Math.round(preview.screenHeight * preview.scale)
      color: Style.hoverFillFor(root.foreground, Color.accent)
      border.color: root.subtle
      border.width: 1
      clip: true

      // Bar strip inside the reachable area, where Hyprland will put it.
      Rectangle {
        readonly property real thickness: Math.max(3, Math.round(root.barThickness * preview.scale))
        readonly property bool horizontal: root.barPosition === "top" || root.barPosition === "bottom"
        x: root.barPosition === "right" ? monitor.width - root.edge.right * preview.scale - thickness : root.edge.left * preview.scale
        y: root.barPosition === "bottom" ? monitor.height - root.edge.bottom * preview.scale - thickness : root.edge.top * preview.scale
        width: horizontal ? monitor.width - (root.edge.left + root.edge.right) * preview.scale : thickness
        height: horizontal ? thickness : monitor.height - (root.edge.top + root.edge.bottom) * preview.scale
        color: root.foreground
        opacity: 0.55
      }

      Repeater {
        model: root.reserve.edgeNames
        Rectangle {
          required property string modelData
          readonly property bool horizontal: Model.isHorizontal(modelData)
          readonly property real size: root.edge[modelData] * preview.scale
          visible: size > 0
          x: modelData === "right" ? monitor.width - size : 0
          y: modelData === "bottom" ? monitor.height - size : 0
          width: horizontal ? monitor.width : size
          height: horizontal ? size : monitor.height
          color: "black"
          opacity: preview.paused ? 0.45 : 1
          Text {
            anchors.centerIn: parent
            visible: parent.horizontal ? parent.height >= font.pixelSize + 4 : parent.width >= implicitWidth + 6
            text: root.edge[parent.modelData]
            color: root.subtle
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }
      }
    }

    // Handles sit outside the clipped monitor so an edge at 0 stays grabbable.
    Repeater {
      model: root.reserve.edgeNames
      MouseArea {
        id: handle
        required property string modelData
        required property int index
        readonly property bool horizontal: Model.isHorizontal(modelData)
        readonly property real boundary: {
          var size = root.edge[modelData] * preview.scale
          if (modelData === "top") return monitor.y + size
          if (modelData === "bottom") return monitor.y + monitor.height - size
          if (modelData === "left") return monitor.x + size
          return monitor.x + monitor.width - size
        }
        readonly property int grab: Style.space(10)
        readonly property bool lit: pressed || containsMouse || root.cursor === index
        x: horizontal ? monitor.x : boundary - grab / 2
        y: horizontal ? boundary - grab / 2 : monitor.y
        width: horizontal ? monitor.width : grab
        height: horizontal ? grab : monitor.height
        hoverEnabled: true
        preventStealing: true
        cursorShape: horizontal ? Qt.SizeVerCursor : Qt.SizeHorCursor

        function drag(mouse) {
          var point = mapToItem(monitor, mouse.x, mouse.y)
          var grid = mouse.modifiers & Qt.ShiftModifier ? 1 : 10
          root.setEdge(modelData, Model.fromPointer(modelData, point.x, point.y, monitor.width, monitor.height, preview.scale, grid, root.limit(modelData)))
        }
        onPressed: function(mouse) { root.cursor = index; drag(mouse) }
        onPositionChanged: function(mouse) { if (pressed) drag(mouse) }
        onReleased: keySurface.forceActiveFocus()
        onWheel: function(wheel) {
          root.cursor = index
          var inward = modelData === "top" || modelData === "left" ? 1 : -1
          root.nudge(modelData, (wheel.angleDelta.y < 0 ? 10 : -10) * inward * (wheel.modifiers & Qt.ShiftModifier ? 10 : 1))
        }

        Rectangle {
          anchors.centerIn: parent
          width: handle.horizontal ? parent.width : Math.max(2, Style.space(2))
          height: handle.horizontal ? Math.max(2, Style.space(2)) : parent.height
          color: Color.accent
          visible: handle.lit
        }
      }
    }

    Text {
      id: caption
      anchors.bottom: parent.bottom
      anchors.horizontalCenter: parent.horizontalCenter
      text: preview.paused
        ? "Paused  ·  reservation kept, not applied"
        : Math.round(preview.screenWidth) + " × " + Math.round(preview.screenHeight)
          + "  →  " + Math.max(0, Math.round(preview.reachWidth)) + " × " + Math.max(0, Math.round(preview.reachHeight)) + " reachable"
      color: root.subtle
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
