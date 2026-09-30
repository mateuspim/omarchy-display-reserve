import QtQuick
import qs.Commons
import "Model.js" as Model

// The calibration ruler: a scale from the middle of every edge to the middle
// of the screen, with a tick every 10 px, a longer one every 50 and the
// distance from that edge every 100. The tick marked N is the first line
// left on screen with N px reserved, so the first tick you can see is about
// how much that edge hides.
Item {
  id: ruler
  property color color: Color.accent
  property string fontFamily: Style.font.family

  Repeater {
    model: Model.EDGES

    Item {
      id: edgeScale
      required property string modelData
      // A top or bottom edge's scale runs down or up the screen.
      readonly property bool vertical: Model.isHorizontal(modelData)
      readonly property real length: Math.floor((vertical ? ruler.height : ruler.width) / 2)
      readonly property real middle: Math.round((vertical ? ruler.width : ruler.height) / 2)
      anchors.fill: parent

      // Where the line `at` px in from this edge starts: rows and columns
      // count from 0, so on the bottom and right edges it is one further in.
      function position(at) {
        if (modelData === "top" || modelData === "left") return at
        return (vertical ? ruler.height : ruler.width) - at - 1
      }

      // A dark band under the scale keeps it readable over any window.
      Rectangle {
        readonly property real start: Math.min(edgeScale.position(0), edgeScale.position(edgeScale.length))
        x: edgeScale.vertical ? edgeScale.middle - 20 : start
        y: edgeScale.vertical ? start : edgeScale.middle - 20
        width: edgeScale.vertical ? 76 : edgeScale.length + 1
        height: edgeScale.vertical ? edgeScale.length + 1 : 40
        color: "black"
        opacity: 0.55
      }

      Repeater {
        model: Model.rulerTicks(edgeScale.length)

        Item {
          id: tick
          required property var modelData
          readonly property real reach: [0, 8, 16, 30][modelData.size]

          Rectangle {
            x: edgeScale.vertical ? edgeScale.middle - tick.reach / 2 : edgeScale.position(tick.modelData.at)
            y: edgeScale.vertical ? edgeScale.position(tick.modelData.at) : edgeScale.middle - tick.reach / 2
            width: edgeScale.vertical ? tick.reach : 1
            height: edgeScale.vertical ? 1 : tick.reach
            color: ruler.color
          }

          Text {
            visible: tick.modelData.label !== ""
            text: tick.modelData.label
            color: ruler.color
            font.family: ruler.fontFamily
            font.pixelSize: 12
            font.bold: true
            x: edgeScale.vertical ? edgeScale.middle + 18 : edgeScale.position(tick.modelData.at) - Math.round(implicitWidth / 2)
            y: edgeScale.vertical ? edgeScale.position(tick.modelData.at) - Math.round(implicitHeight / 2) : edgeScale.middle + 3
          }
        }
      }
    }
  }
}
