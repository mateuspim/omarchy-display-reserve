import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import "." as Reserve
import "Model.js" as Model

// Every reserved edge gets two layer surfaces:
//
//  - a Bottom-layer spacer whose exclusive zone does the actual reserving.
//    Hyprland arranges exclusive zones from the Background layer upwards, so
//    the spacer claims the edge before the Top-layer Omarchy bar does and the
//    bar lands just inside the reachable area instead of underneath the cap.
//    Tiled windows follow, with no monitors.lua rewrite or hyprctl reload.
//  - an Overlay-layer cap over exactly the same strip that swallows the
//    pointer and hides fullscreen or floating windows that stray into it.
//    It shows the monitor's fill (ReserveFill): black by default, and black
//    while the monitor shows a fullscreen window.
Scope {
  id: root

  Variants {
    model: Quickshell.screens

    delegate: Scope {
      id: output
      required property var modelData
      // Fitted here as well as in the panel: hand edits and mode changes
      // never go through the panel's limits.
      readonly property var edge: Model.fit(Reserve.ReserveState.appliedEdges(modelData.name), modelData.width, modelData.height)
      // A fullscreen window (a video, a game) gets plain black beside it,
      // whatever the fill, rather than a bright logo or wallpaper.
      readonly property bool fullscreen: Hyprland.monitorFor(modelData)?.activeWorkspace?.hasFullscreen ?? false
      function fillFor(side) { return fullscreen ? "black" : Model.edgeFill(edge, side) }

      ReservedEdge { screen: output.modelData; side: "top"; pixels: output.edge.top; fill: output.fillFor("top") }
      ReservedEdge { screen: output.modelData; side: "bottom"; pixels: output.edge.bottom; fill: output.fillFor("bottom") }
      ReservedEdge { screen: output.modelData; side: "left"; pixels: output.edge.left; fill: output.fillFor("left") }
      ReservedEdge { screen: output.modelData; side: "right"; pixels: output.edge.right; fill: output.fillFor("right") }
    }
  }

  // Fullscreen on a monitor with a reserve fills the reachable area rather
  // than the whole monitor, where the cap would crop it (Model.fullscreenChanges).
  property var fitted: []

  Connections {
    target: Hyprland
    function onRawEvent(event) { if (event.name === "fullscreen") fullscreenCheck.request() }
  }

  Process {
    id: fullscreenCheck
    // An event while a check runs asks for another one when it finishes.
    property bool again: false
    function request() { if (running) again = true; else running = true }
    command: ["hyprctl", "-j", "clients"]
    onExited: if (again) { again = false; running = true }
    stdout: StdioCollector {
      onStreamFinished: {
        var clients = []
        try { clients = JSON.parse(text) } catch (e) { return }
        var reserved = Hyprland.monitors.values
          .filter(function(monitor) { return Reserve.ReserveState.isActive(monitor.name) })
          .map(function(monitor) { return monitor.id })
        var result = Model.fullscreenChanges(clients, reserved, root.fitted)
        root.fitted = result.fitted
        result.changes.forEach(function(change) {
          Hyprland.dispatch(Hyprland.usingLua
            ? 'hl.dsp.window.fullscreen_state({ window = "address:' + change.address + '", internal = ' + change.internal + ', client = ' + change.client + ' })'
            // The old dispatcher takes no window: it acts on the focused one,
            // which is almost always the one that just went fullscreen.
            : "fullscreenstate " + change.internal + " " + change.client)
        })
      }
    }
  }

  // An edge at 0 has no surfaces at all, rather than two hidden ones, so an
  // unreserved monitor costs nothing.
  component ReservedEdge: LazyLoader {
    id: reserved
    required property var screen
    required property string side
    required property int pixels
    required property string fill
    active: pixels > 0

    Scope {
      Strip {
        screen: reserved.screen
        side: reserved.side
        pixels: reserved.pixels
        exclusionMode: ExclusionMode.Auto
        WlrLayershell.namespace: "pym-display-reserve-spacer"
        WlrLayershell.layer: WlrLayer.Bottom
      }

      Strip {
        screen: reserved.screen
        side: reserved.side
        pixels: reserved.pixels
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "pym-display-reserve"
        WlrLayershell.layer: WlrLayer.Overlay
        MouseArea { anchors.fill: parent }
        Reserve.ReserveFill {
          anchors.fill: parent
          side: reserved.side
          mode: reserved.fill
          size: reserved.pixels
          screenWidth: reserved.screen.width
          screenHeight: reserved.screen.height
        }
      }
    }
  }

  // A black layer surface covering `pixels` along one edge of its screen.
  // The spacer and the cap share it, so they always cover the same strip.
  component Strip: PanelWindow {
    id: strip
    required property string side
    required property int pixels
    readonly property bool horizontal: Model.isHorizontal(side)
    anchors { top: strip.side !== "bottom"; bottom: strip.side !== "top"; left: strip.side !== "right"; right: strip.side !== "left" }
    implicitHeight: horizontal ? pixels : 0
    implicitWidth: horizontal ? 0 : pixels
    color: "black"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
  }
}
