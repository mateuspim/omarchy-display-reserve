import QtQuick
import Quickshell
import Quickshell.Hyprland
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
  // Fitted to the monitor like the service draws them: hand edits and mode
  // changes never went through the panel's limits, and edits must start
  // from what is on screen.
  readonly property var edge: fitted(reserve.edges(output), outputScreen)
  readonly property var activeEdge: fitted(reserve.activeEdges(output), outputScreen)
  readonly property bool reserved: reserve.isReserved(output)
  // Reservations are in logical pixels; on a scaled monitor that is not
  // what a ruler on the panel measures, so the edges header says so.
  readonly property real outputScale: {
    var monitor = outputScreen ? Hyprland.monitorFor(outputScreen) : null
    return monitor && monitor.scale > 0 ? monitor.scale : 1
  }
  readonly property var barEntry: reserve.edges(barOutput)
  readonly property bool barReserved: Model.total(barEntry) > 0

  // One step back for the edits that throw values away: Clear and zeroing an
  // edge. Any other edit, or closing the panel, drops it.
  property var undo: null
  readonly property bool canUndo: undo !== null && undo.output === output
  property bool showKeys: false

  // Keyboard cursor over the four edge rows.
  property int cursor: 0
  readonly property string cursorEdge: reserve.edgeNames[cursor]

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // --- popout placement ------------------------------------------------------
  //
  // KeyboardPanel assumes the bar touches the screen edge. A reservation on
  // the bar's side pushes the bar inwards, so `gap` grows by that amount and
  // the card opens beside the bar, not inside the black cap. Reservations
  // on the two edges beside the bar shift the bar along its length and can
  // hide the card's ends, which `popupAnchor` corrects.
  readonly property bool barHorizontal: barPosition === "top" || barPosition === "bottom"
  // Placement follows the bar's own monitor, not the one picked in the panel,
  // and the applied reservation, which is where the bar really is. It holds
  // still during a drag, so the card cannot slide under the pointer.
  readonly property var barEdge: fitted(reserve.appliedEdges(barOutput), barWindow ? barWindow.screen : null)
  readonly property int barSideReserve: barEdge[barPosition] || 0

  TransformWatcher {
    id: barWatcher
    a: root.barWindow ? root.barWindow.contentItem : null
    b: root
  }
  readonly property point barPos: {
    barWatcher.transform  // reactive dependency, as in KeyboardPanel
    return barWindow ? root.mapToItem(barWindow.contentItem, 0, 0) : Qt.point(0, 0)
  }

  // KeyboardPanel centers the card on its anchor in bar coordinates and only
  // keeps it `margin` from the screen edges. This invisible stand-in for the
  // button is offset so that the card lands centered on the button's real
  // screen position and clear of both side caps.
  Item {
    id: popupAnchor
    width: button.width
    height: button.height
    readonly property real offset: {
      var before = root.barHorizontal ? root.barEdge.left : root.barEdge.top
      var after = root.barHorizontal ? root.barEdge.right : root.barEdge.bottom
      var along = root.barHorizontal ? root.barPos.x : root.barPos.y
      var size = root.barHorizontal ? button.width : button.height
      var card = root.barHorizontal ? popup.contentWidth : popup.contentHeight
      var screen = root.barWindow && root.barWindow.screen
        ? (root.barHorizontal ? root.barWindow.screen.width : root.barWindow.screen.height) : 0
      if (!(screen > 0)) return 0
      var start = along + before + size / 2 - card / 2
      var wanted = Math.max(before + popup.margin, Math.min(start, screen - after - card - popup.margin))
      return wanted - (along + size / 2 - card / 2)
    }
    x: root.barHorizontal ? offset : 0
    y: root.barHorizontal ? 0 : offset
  }

  // The bar as KeyboardPanel sees it. KeyboardPanel matches clicks against
  // bar buttons as if the bar started at the screen's top-left corner (or
  // its bottom or right edge for such bars). A reservation on the bar's side
  // pushes the bar inwards, and one on its leading edge (left of a
  // horizontal bar, top of a vertical one) shifts it along; either way a
  // click would press the wrong button, or one from inside the cap. Hide
  // the buttons from it then: a click on the bar just closes the card.
  readonly property bool barShifted: barSideReserve > 0 || (barHorizontal ? barEdge.left : barEdge.top) > 0
  property QtObject popupBar: QtObject {
    readonly property string position: root.barPosition
    readonly property int barSize: root.bar ? root.bar.barSize : 0
    readonly property var activePopout: root.bar ? root.bar.activePopout : null
    readonly property var clickTargets: root.barShifted || !root.bar ? [] : root.bar.clickTargets
    function requestPopout(owner) { if (root.bar) root.bar.requestPopout(owner) }
    function releasePopout(owner) { if (root.bar) root.bar.releasePopout(owner) }
    function targetBelongsToWindow(target, window) { return root.bar ? root.bar.targetBelongsToWindow(target, window) : false }
  }

  onOpenedChanged: {
    if (!opened) { reserve.hold(false); reserve.flush(); return }
    pickedOutput = ""
    undo = null
    showKeys = false
  }
  // A bar rebuild or hotplug can destroy the widget mid-drag, and nothing
  // else would release the hold.
  Component.onDestruction: if (opened) { reserve.hold(false); reserve.flush() }

  function fitted(entry, screen) {
    return screen ? Model.fit(entry, screen.width, screen.height) : entry
  }
  function limit(side) {
    return Model.limit(side, outputScreen ? outputScreen.width : 0, outputScreen ? outputScreen.height : 0, edge[Model.opposite(side)])
  }
  function setEdge(side, pixels) {
    var value = Model.clamp(Model.pixels(pixels), 0, limit(side))
    if (value !== edge[side]) undo = null
    reserve.setEdge(output, side, value)
  }
  function nudge(side, delta) { setEdge(side, Model.nudge(edge[side], delta, limit(side))) }
  function toggleEnabled(name) {
    if (!reserve.isReserved(name)) return
    undo = null
    reserve.setEnabled(name, !reserve.edges(name).enabled)
  }
  function zero(side) {
    if (!edge[side]) return
    var saved = { output: output, entry: reserve.edges(output) }
    setEdge(side, 0)
    undo = saved
  }
  function clearOutput() {
    if (!reserved) return
    var saved = { output: output, entry: reserve.edges(output) }
    reserve.clear(output)
    undo = saved
  }
  function undoLast() {
    if (!canUndo) return
    reserve.update(undo.output, undo.entry)
    undo = null
  }
  function cycleOutput(direction) {
    if (screenNames.length < 2) return
    var index = screenNames.indexOf(output)
    pickedOutput = screenNames[(index + direction + screenNames.length) % screenNames.length]
  }

  function handleKey(event) {
    // A number field has focus and did not take this key. Typing stays in the
    // field; only the keys that end an edit act, and moving focus back to the
    // panel commits the typed value.
    if (!keySurface.activeFocus) {
      var ends = [Qt.Key_Escape, Qt.Key_Return, Qt.Key_Enter, Qt.Key_Tab, Qt.Key_Backtab]
      if (ends.indexOf(event.key) !== -1) { keySurface.forceActiveFocus(); event.accepted = true }
      return
    }
    if (event.text === "?") { showKeys = !showKeys; event.accepted = true; return }
    if (event.key === Qt.Key_Escape && showKeys) { showKeys = false; event.accepted = true; return }
    if (event.key === Qt.Key_Escape || event.text === "q") { root.close(); event.accepted = true; return }
    var shift = event.modifiers & Qt.ShiftModifier
    var step = shift ? 100 : (event.modifiers & Qt.ControlModifier ? 1 : 10)
    var key = event.key
    if (key === Qt.Key_Up || key === Qt.Key_K) cursor = Math.max(0, cursor - 1)
    else if (key === Qt.Key_Down || key === Qt.Key_J) cursor = Math.min(reserve.edgeNames.length - 1, cursor + 1)
    else if (key === Qt.Key_Left || key === Qt.Key_H) nudge(cursorEdge, -step)
    else if (key === Qt.Key_Right || key === Qt.Key_L) nudge(cursorEdge, step)
    else if (key === Qt.Key_0 || key === Qt.Key_Backspace || key === Qt.Key_Delete) zero(cursorEdge)
    else if (key === Qt.Key_U || (key === Qt.Key_Z && event.modifiers & Qt.ControlModifier)) undoLast()
    else if (key === Qt.Key_Tab) cycleOutput(shift ? -1 : 1)
    else if (key === Qt.Key_Backtab) cycleOutput(-1)
    else if (key === Qt.Key_Space || key === Qt.Key_P) toggleEnabled(output)
    else return
    event.accepted = true
  }

  BarIconButton {
    id: button
    bar: root.bar
    // The same glyphs as the monitor buttons: a crossed-out monitor is paused.
    text: root.barReserved && !root.barEntry.enabled ? "󰶐" : "󰍹"
    active: root.opened || root.reserve.isActive(root.barOutput)
    tooltipText: root.barOutput + "  ·  " + Model.summary(root.barEntry)
      + (root.barReserved ? "\nRight click to " + (root.barEntry.enabled ? "pause" : "resume") : "")
    Accessible.role: Accessible.Button
    Accessible.name: "Display Reserve"
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.toggle()
      else if (mouseButton === Qt.RightButton) root.toggleEnabled(root.barOutput)
    }
  }

  KeyboardPanel {
    id: popup
    anchorItem: popupAnchor
    owner: root
    bar: root.popupBar
    open: root.opened
    focusTarget: keySurface
    contentWidth: fittedContentWidth(Style.space(380))
    contentHeight: fittedContentHeight(content.implicitHeight)
    gap: Style.gapsOut + root.barSideReserve

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
              text: root.reserved && !root.edge.enabled ? "󰶐" : "󰍹"
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
        // share one height; as on the bar, a crossed-out monitor is paused.
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
              iconText: root.reserve.isReserved(modelData) && !root.reserve.edges(modelData).enabled ? "󰶐" : "󰍹"
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
            text: root.outputScale === 1 ? "EDGES  ·  PIXELS"
              : "EDGES  ·  LOGICAL PIXELS  ·  " + Number(root.outputScale.toFixed(2)) + "× SCALE"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }
          Repeater {
            model: root.reserve.edgeNames
            EdgeRow { width: parent.width }
          }
        }

        // Shortcut sheet, toggled with ?.
        Grid {
          visible: root.showKeys
          width: parent.width
          columns: 2
          columnSpacing: Style.spacing.lg
          rowSpacing: Style.spacing.xs
          Repeater {
            model: [
              "J / K", "Select edge",
              "H / L", "Shrink / grow 10 px  ·  ⇧ 100  ·  Ctrl 1",
              "0 / ⌫", "Zero edge",
              "U / Ctrl Z", "Undo clear or zero",
              "Space / P", "Pause monitor",
              "Tab / ⇧ Tab", "Next / previous monitor",
              "Drag", "Move an edge in the preview  ·  Ctrl 1 px",
              "Scroll", "Move an edge 10 px  ·  ⇧ 100",
              "Esc / Q", "Close"
            ]
            Text {
              required property string modelData
              required property int index
              text: modelData
              color: index % 2 === 0 ? root.foreground : root.subtle
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: index % 2 === 0
            }
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
            text: root.showKeys ? "? hide shortcuts" : "? shortcuts"
            color: root.subtle
            elide: Text.ElideRight
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
          Button {
            id: clearButton
            anchors.right: parent.right
            // Turns into Undo right after it (or a zeroed edge) discards values.
            text: root.canUndo ? "Undo" : "Clear"
            iconText: root.canUndo ? "󰕌" : "󰅖"
            enabled: root.canUndo || root.reserved
            opacity: enabled ? 1 : 0.4
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            tooltipText: root.canUndo ? "Restore " + Model.summary(root.undo.entry) : "Remove every reserved edge on " + root.output
            onClicked: {
              if (root.canUndo) root.undoLast()
              else root.clearOutput()
              keySurface.forceActiveFocus()
            }
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
      onDraggingChanged: root.reserve.hold(dragging)
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
    // The field being typed in is the selected edge, so the keys that end
    // the edit and the highlight refer to the same row.
    Connections {
      target: field.field
      function onActiveFocusChanged() { if (field.field.activeFocus) root.cursor = row.index }
    }
  }

  // The selected monitor to scale: black reserved edges, the reachable area,
  // where the bar will sit, and a draggable handle on every edge.
  component MonitorPreview: Item {
    id: preview
    readonly property real screenWidth: root.outputScreen ? root.outputScreen.width : 16
    readonly property real screenHeight: root.outputScreen ? root.outputScreen.height : 9
    readonly property real ratio: Math.min(width / screenWidth, (height - caption.height - Style.spacing.sm) / screenHeight)
    readonly property bool paused: !root.edge.enabled
    readonly property real reachWidth: screenWidth - root.edge.left - root.edge.right
    readonly property real reachHeight: screenHeight - root.edge.top - root.edge.bottom
    readonly property Item monitorItem: monitor

    Rectangle {
      id: monitor
      anchors.horizontalCenter: parent.horizontalCenter
      width: Math.round(preview.screenWidth * preview.ratio)
      height: Math.round(preview.screenHeight * preview.ratio)
      color: Style.hoverFillFor(root.foreground, Color.accent)
      border.color: root.subtle
      border.width: 1
      clip: true

      // Bar strip where Hyprland puts it: inside the reachable area, or at
      // the screen edge while the monitor is paused.
      Rectangle {
        readonly property real thickness: Math.max(3, Math.round(root.barThickness * preview.ratio))
        readonly property bool horizontal: root.barHorizontal
        x: root.barPosition === "right" ? monitor.width - root.activeEdge.right * preview.ratio - thickness : root.activeEdge.left * preview.ratio
        y: root.barPosition === "bottom" ? monitor.height - root.activeEdge.bottom * preview.ratio - thickness : root.activeEdge.top * preview.ratio
        width: horizontal ? monitor.width - (root.activeEdge.left + root.activeEdge.right) * preview.ratio : thickness
        height: horizontal ? thickness : monitor.height - (root.activeEdge.top + root.activeEdge.bottom) * preview.ratio
        color: root.foreground
        opacity: 0.55
      }

      Repeater {
        model: root.reserve.edgeNames
        Rectangle {
          required property string modelData
          readonly property bool horizontal: Model.isHorizontal(modelData)
          readonly property real size: root.edge[modelData] * preview.ratio
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

    // An edge drags from anywhere in its black strip, or from the thin
    // handle on its boundary, which sits outside the clipped monitor so an
    // edge at 0 stays grabbable. Handles come second, so a boundary wins
    // where it crosses another edge's strip.
    Repeater {
      model: root.reserve.edgeNames
      EdgeDrag {
        view: preview
        readonly property real size: root.edge[modelData] * preview.ratio
        visible: size > 0
        x: monitor.x + (modelData === "right" ? monitor.width - size : 0)
        y: monitor.y + (modelData === "bottom" ? monitor.height - size : 0)
        width: horizontal ? monitor.width : size
        height: horizontal ? size : monitor.height
      }
    }
    Repeater {
      model: root.reserve.edgeNames
      EdgeDrag {
        id: handle
        view: preview
        readonly property real boundary: {
          var size = root.edge[modelData] * preview.ratio
          if (modelData === "top") return monitor.y + size
          if (modelData === "bottom") return monitor.y + monitor.height - size
          if (modelData === "left") return monitor.x + size
          return monitor.x + monitor.width - size
        }
        readonly property int grab: Style.space(10)
        x: horizontal ? monitor.x : boundary - grab / 2
        y: horizontal ? boundary - grab / 2 : monitor.y
        width: horizontal ? monitor.width : grab
        height: horizontal ? grab : monitor.height

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

  // Drags and scrolls one edge of a MonitorPreview. Drags are relative to the
  // press, so grabbing anywhere neither moves nor snaps the edge until the
  // pointer does, and the screen holds still until release.
  component EdgeDrag: MouseArea {
    id: drag
    required property string modelData
    required property int index
    required property Item view
    readonly property Item monitor: view.monitorItem
    readonly property bool horizontal: Model.isHorizontal(modelData)
    readonly property bool lit: pressed || containsMouse || root.cursor === index
    hoverEnabled: true
    preventStealing: true
    cursorShape: horizontal ? Qt.SizeVerCursor : Qt.SizeHorCursor

    property int startValue: 0
    property point startPoint: Qt.point(0, 0)
    property real wheelRest: 0

    onPressed: function(mouse) {
      root.reserve.hold(true)
      root.cursor = index
      startValue = root.edge[modelData]
      startPoint = mapToItem(monitor, mouse.x, mouse.y)
    }
    onPositionChanged: function(mouse) {
      if (!pressed) return
      var point = mapToItem(monitor, mouse.x, mouse.y)
      var grid = mouse.modifiers & Qt.ControlModifier ? 1 : 10
      root.setEdge(modelData, Model.fromDrag(modelData, startValue, point.x - startPoint.x, point.y - startPoint.y, view.ratio, grid, root.limit(modelData)))
    }
    onReleased: { root.reserve.hold(false); keySurface.forceActiveFocus() }
    onCanceled: root.reserve.hold(false)
    onWheel: function(wheel) {
      root.cursor = index
      wheelRest += wheel.angleDelta.y
      var steps = Model.notches(wheelRest)
      if (!steps) return
      wheelRest -= steps * 120
      // Scrolling down moves the boundary down or right.
      var inward = modelData === "top" || modelData === "left" ? 1 : -1
      root.nudge(modelData, -steps * 10 * inward * (wheel.modifiers & Qt.ShiftModifier ? 10 : 1))
    }
  }
}
