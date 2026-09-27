import QtQuick
import Quickshell
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
//  - an Overlay-layer black cap over exactly the same strip that swallows the
//    pointer and hides fullscreen or floating windows that stray into it.
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

      ReservedEdge { screen: output.modelData; side: "top"; pixels: output.edge.top }
      ReservedEdge { screen: output.modelData; side: "bottom"; pixels: output.edge.bottom }
      ReservedEdge { screen: output.modelData; side: "left"; pixels: output.edge.left }
      ReservedEdge { screen: output.modelData; side: "right"; pixels: output.edge.right }
    }
  }

  component ReservedEdge: Scope {
    id: reserved
    required property var screen
    required property string side
    required property int pixels
    readonly property bool horizontal: side === "top" || side === "bottom"

    PanelWindow {
      screen: reserved.screen
      visible: reserved.pixels > 0
      anchors { top: reserved.side !== "bottom"; bottom: reserved.side !== "top"; left: reserved.side !== "right"; right: reserved.side !== "left" }
      implicitHeight: reserved.horizontal ? reserved.pixels : 0
      implicitWidth: reserved.horizontal ? 0 : reserved.pixels
      color: "black"
      exclusionMode: ExclusionMode.Auto
      WlrLayershell.namespace: "pym-display-reserve-spacer"
      WlrLayershell.layer: WlrLayer.Bottom
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    }

    PanelWindow {
      screen: reserved.screen
      visible: reserved.pixels > 0
      anchors { top: reserved.side !== "bottom"; bottom: reserved.side !== "top"; left: reserved.side !== "right"; right: reserved.side !== "left" }
      implicitHeight: reserved.horizontal ? reserved.pixels : 0
      implicitWidth: reserved.horizontal ? 0 : reserved.pixels
      color: "black"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "pym-display-reserve"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      MouseArea { anchors.fill: parent }
    }
  }
}
