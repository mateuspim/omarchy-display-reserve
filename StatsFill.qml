import QtQuick
import qs.Commons
import "." as Reserve
import "Stats.js" as Stats

// The stats fill: the monitor's chosen panels tiled over the strip as
// btop-style cards (Stats.fit), with live numbers from the shared
// sampler. It is laid out at the strip's real size and scaled by
// `pixelRatio`, so the panel's small preview shows the same layout. The
// whole board moves with the burn-in `shift`, a third of a unit per step.
Item {
  id: root
  property var panels: []
  property real pixelRatio: 1
  property var shift: ({ x: 0, y: 0 })
  readonly property var sampler: Reserve.ReserveState.stats
  readonly property real boardWidth: width / pixelRatio
  readonly property real boardHeight: height / pixelRatio
  readonly property var grid: Stats.fit(panels, boardWidth, boardHeight)
  readonly property int unit: grid.unit

  Item {
    width: root.boardWidth
    height: root.boardHeight
    scale: root.pixelRatio
    transformOrigin: Item.TopLeft
    x: Math.round(root.shift.x * root.unit / 3) * root.pixelRatio
    y: Math.round(root.shift.y * root.unit / 3) * root.pixelRatio

    Repeater {
      model: root.grid.cards
      Reserve.StatsCard {
        required property var modelData
        x: Math.round(modelData.x)
        y: Math.round(modelData.y)
        width: Math.round(modelData.width)
        height: Math.round(modelData.height)
        unit: root.unit
        theme: root.sampler.palette
        // Rows that fit under the title, a row and its gap each, for
        // panels whose lists grow to fill the card.
        readonly property int room: Math.floor((height - Math.round(root.unit * 1.6) - root.unit)
          / (Math.round(root.unit * 1.25) + Math.round(root.unit * 0.35)))
        view: Stats.view(modelData.panel, root.sampler.data, root.sampler.palette, room, width > height * Stats.WIDE_CARD)
      }
    }
  }
}
