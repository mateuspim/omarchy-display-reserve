import QtQuick
import QtQuick.Shapes
import qs.Commons
import qs.Commons as Commons

// Native rendering of icon.svg (24-unit grid): a monitor with its top and
// bottom edges reserved and the bar in the reachable band between them.
// Drawn with Shapes rather than an Image so it takes the bar's color and
// stays crisp in a 16 px bar slot. `reserved: false` leaves the edges out,
// for a monitor with nothing reserved; `paused` strikes it through, like
// the crossed-out monitor glyph it replaces.
Item {
  id: root

  property real iconSize: Style.font.icon
  property color color: Commons.Color.foreground
  property bool reserved: true
  property bool paused: false
  readonly property real unit: iconSize / 24

  width: iconSize
  height: iconSize
  implicitWidth: iconSize
  implicitHeight: iconSize

  Shape {
    anchors.fill: parent
    preferredRendererType: Shape.CurveRenderer

    // Frame and stand.
    ShapePath {
      fillColor: "transparent"
      strokeColor: root.color
      strokeWidth: 1.5 * root.unit
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin
      scale: Qt.size(root.unit, root.unit)
      PathSvg { path: "M4.5 3 H19.5 A2 2 0 0 1 21.5 5 V15 A2 2 0 0 1 19.5 17 H4.5 A2 2 0 0 1 2.5 15 V5 A2 2 0 0 1 4.5 3 Z M12 17 V19.6 M8.5 20.6 H15.5" }
    }

    // The bar: two workspace dots and the clock.
    ShapePath {
      fillColor: root.color
      strokeColor: "transparent"
      scale: Qt.size(root.unit, root.unit)
      PathSvg { path: "M5.35 10 A0.75 0.75 0 1 0 6.85 10 A0.75 0.75 0 1 0 5.35 10 Z M7.45 10 A0.75 0.75 0 1 0 8.95 10 A0.75 0.75 0 1 0 7.45 10 Z" }
    }
    ShapePath {
      fillColor: "transparent"
      strokeColor: root.color
      strokeWidth: 1.3 * root.unit
      capStyle: ShapePath.RoundCap
      scale: Qt.size(root.unit, root.unit)
      PathSvg { path: "M15 10 H17.9" }
    }
  }

  // The reserved edges, the bottom one lighter.
  Rectangle {
    visible: root.reserved
    x: 4.5 * root.unit; y: 5 * root.unit
    width: 15 * root.unit; height: 3 * root.unit
    radius: 0.6 * root.unit
    color: root.color
  }
  Rectangle {
    visible: root.reserved
    x: 4.5 * root.unit; y: 12 * root.unit
    width: 15 * root.unit; height: 3 * root.unit
    radius: 0.6 * root.unit
    color: root.color
    opacity: 0.5
  }

  Shape {
    anchors.fill: parent
    visible: root.paused
    preferredRendererType: Shape.CurveRenderer
    ShapePath {
      fillColor: "transparent"
      strokeColor: root.color
      strokeWidth: 1.5 * root.unit
      capStyle: ShapePath.RoundCap
      scale: Qt.size(root.unit, root.unit)
      PathSvg { path: "M3 2.5 L21 18.5" }
    }
  }
}
