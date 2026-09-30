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
//    while the monitor shows a fullscreen window or the session is idle.
Scope {
  id: root
  readonly property var state: Reserve.ReserveState

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
      function fillFor(side) { return fullscreen || root.idle ? "black" : Model.edgeFill(edge, side) }

      ReservedEdge { screen: output.modelData; side: "top"; pixels: output.edge.top; fill: output.fillFor("top") }
      ReservedEdge { screen: output.modelData; side: "bottom"; pixels: output.edge.bottom; fill: output.fillFor("bottom") }
      ReservedEdge { screen: output.modelData; side: "left"; pixels: output.edge.left; fill: output.fillFor("left") }
      ReservedEdge { screen: output.modelData; side: "right"; pixels: output.edge.right; fill: output.fillFor("right") }
    }
  }

  // Every edge goes black once the session has been idle for
  // ReserveState.idleBlack seconds, and back on the next input. An app that
  // inhibits idle, such as a video player, holds it off like it holds off
  // the screensaver.
  readonly property bool idle: idleMonitor.enabled && idleMonitor.isIdle
  IdleMonitor {
    id: idleMonitor
    enabled: root.state.idleBlack > 0
    timeout: Math.max(1, root.state.idleBlack)
    respectInhibitors: true
  }

  // The calibration ruler, over everything and click-through, on the
  // monitor ReserveState.ruler names.
  Variants {
    model: Quickshell.screens

    delegate: Scope {
      id: rulerOutput
      required property var modelData

      LazyLoader {
        active: root.state.ruler === rulerOutput.modelData.name

        PanelWindow {
          screen: rulerOutput.modelData
          anchors { top: true; bottom: true; left: true; right: true }
          exclusionMode: ExclusionMode.Ignore
          color: "transparent"
          mask: Region {}
          WlrLayershell.namespace: "pym-display-reserve-ruler"
          WlrLayershell.layer: WlrLayer.Overlay
          WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
          Reserve.Ruler { anchors.fill: parent }
        }
      }
    }
  }

  // Monitors named by an IPC argument: a connector name (DP-4), "" or
  // "focused" for the focused monitor, or "all".
  function outputsFor(output) {
    var names = []
    for (var i = 0; i < Quickshell.screens.length; i++) names.push(String(Quickshell.screens[i].name))
    output = String(output || "")
    if (output === "all") return names
    if (output === "" || output === "focused")
      return Hyprland.focusedMonitor ? [String(Hyprland.focusedMonitor.name)] : []
    return names.indexOf(output) !== -1 ? [output] : []
  }

  function screenFor(name) {
    for (var i = 0; i < Quickshell.screens.length; i++)
      if (Quickshell.screens[i].name === name) return Quickshell.screens[i]
    return null
  }

  // Runs `action` on each monitor `output` names and answers with one line
  // per monitor: what `action` returned (an error or a note), or the
  // monitor's summary.
  function each(output, action) {
    var names = outputsFor(output)
    if (!names.length) return output && output !== "focused" ? "No monitor named " + output : "No focused monitor"
    return names.map(function(name) {
      return name + "  ·  " + (action(name) || Model.summary(root.state.edges(name)))
    }).join("\n")
  }

  function needsReserve(name) { return root.state.isReserved(name) ? "" : "No reserved edges" }

  // Sets a fill and says so even without reserved edges, where the summary
  // leaves it out.
  function setFill(name, fill) {
    root.state.setFill(name, fill)
    return root.state.isReserved(name) ? "" : Model.fillName(fill) + "  ·  no reserved edges to show it"
  }

  // omarchy-shell pym.display-reserve <function> [arguments]; README.md
  // lists them.
  IpcHandler {
    target: "pym.display-reserve"

    function status(): string {
      var result = { idleBlack: root.state.idleBlack, idle: root.idle, ruler: root.state.ruler, outputs: {} }
      root.outputsFor("all").forEach(function(name) { result.outputs[name] = root.state.edges(name) })
      return JSON.stringify(result)
    }
    function toggle(output: string): string {
      return root.each(output, function(name) { return root.needsReserve(name) || root.state.setEnabled(name, !root.state.edges(name).enabled) })
    }
    function pause(output: string): string {
      return root.each(output, function(name) { return root.needsReserve(name) || root.state.setEnabled(name, false) })
    }
    function resume(output: string): string {
      return root.each(output, function(name) { return root.needsReserve(name) || root.state.setEnabled(name, true) })
    }
    function fill(output: string, fill: string): string {
      var key = Model.fillFrom(fill)
      if (!key) return "Unknown fill " + fill + "; one of " + Model.FILLS.join(", ")
      return root.each(output, function(name) { return root.setFill(name, key) })
    }
    function nextFill(output: string): string {
      return root.each(output, function(name) { return root.setFill(name, Model.nextFill(root.state.edges(name).fill)) })
    }
    function edge(output: string, side: string, pixels: int): string {
      if (Model.EDGES.indexOf(side) === -1) return "Unknown edge " + side + "; one of " + Model.EDGES.join(", ")
      return root.each(output, function(name) {
        var screen = root.screenFor(name)
        var entry = root.state.edges(name)
        root.state.setEdge(name, side, Model.clamp(pixels, 0, Model.limit(side, screen.width, screen.height, entry[Model.opposite(side)])))
      })
    }
    function aspect(output: string, ratio: string, align: string): string {
      var value = Model.parseAspect(ratio)
      if (!value) return "Unknown aspect " + ratio + "; for example 16:9"
      if (align && !Model.alignment(align)) return "Unknown alignment " + align + "; top, left, center, bottom or right"
      return root.each(output, function(name) {
        var screen = root.screenFor(name)
        root.state.setAspect(name, screen.width, screen.height, value,
          Model.alignment(align) || Model.inferAlign(root.state.edges(name), screen.width, screen.height))
      })
    }
    function ruler(output: string): string {
      var names = root.outputsFor(output)
      if (names.length !== 1) return names.length ? "The ruler shows on one monitor at a time" : "No monitor named " + output
      root.state.toggleRuler(names[0])
      return root.state.ruler ? "Ruler on " + root.state.ruler : "Ruler off"
    }
    function idle(seconds: int): string {
      root.state.setIdleBlack(seconds)
      return "Black when idle: " + Model.idleName(root.state.idleBlack)
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
