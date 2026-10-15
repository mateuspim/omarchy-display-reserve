import QtQuick
import "." as Reserve
import "Stats.js" as Stats

// A history graph in the style of btop: the newest sample on the right, a
// translucent area under a line, both colored by height through `stops`
// so a busy stretch climbs into the hotter color. Faint guides mark the
// quarters.
//
// It scrolls rather than jumps: the canvas is one sample wider than the
// graph, painted with the newest sample just out of sight on the right,
// and slides left by that sample over `duration`, the time until the next
// one, so the line moves steadily. The samples span the whole canvas, so
// the oldest one leaves on the left as the newest comes in on the right,
// with no gap on either side. The slide follows the sampler's clock, at the
// frame pace chosen for the dashboard; without animation the new sample
// shows at once.
Item {
  id: graph
  property var values: []
  property real maximum: 100
  property var stops: ["#888888", "#888888", "#888888"]
  property color guideColor: "#444444"
  property real lineWidth: 1.5
  property int duration: 1000
  // A full history spans the canvas: HISTORY samples, HISTORY - 1 steps,
  // one of them hidden on the right.
  readonly property real step: width / (Stats.HISTORY - 2)
  clip: true

  // Only a new sample scrolls; the views hand over the same history again
  // when it has not moved, and a new maximum or size only repaints.
  property var shownValues: null
  onValuesChanged: {
    if (values === shownValues) return
    shownValues = values
    canvas.scrollPending = true
    canvas.requestPaint()
  }
  onMaximumChanged: canvas.requestPaint()
  onStopsChanged: canvas.requestPaint()

  Canvas {
    id: canvas
    width: graph.width + graph.step
    height: graph.height
    readonly property var clock: Reserve.ReserveState.stats
    // When the slide to the newest sample began, on the clock.
    property real slideStart: 0
    x: clock.animated ? -graph.step * Stats.progress(clock.now, slideStart, graph.duration) : -graph.step
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()

    // Set when a new sample needs the slide restarted, which happens in
    // the paint itself, so the new picture and its starting place show up
    // in the same frame.
    property bool scrollPending: false

    onPaint: {
      if (scrollPending) {
        // The new sample is past the right edge: start where the old
        // picture was, and slide it into view.
        scrollPending = false
        slideStart = clock.now
      }
      var ctx = getContext("2d")
      ctx.reset()
      if (width < 2 || height < 2) return

      ctx.strokeStyle = graph.guideColor
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      for (var q = 1; q < 4; q++) {
        var gy = Math.round(height * q / 4) + 0.5
        ctx.beginPath()
        ctx.moveTo(0, gy)
        ctx.lineTo(width, gy)
        ctx.stroke()
      }

      var values = graph.values
      var count = values.length
      if (count < 2) return
      var step = graph.step
      var top = graph.lineWidth / 2
      // Not x and y: those would shadow the canvas's own position.
      function px(i) { return width - (count - 1 - i) * step }
      function py(i) { return top + (height - top) * (1 - Math.max(0, Math.min(1, values[i] / graph.maximum))) }

      var gradient = ctx.createLinearGradient(0, height, 0, 0)
      gradient.addColorStop(0, graph.stops[0])
      gradient.addColorStop(0.5, graph.stops[1])
      gradient.addColorStop(1, graph.stops[2])

      ctx.beginPath()
      ctx.moveTo(px(0), height)
      for (var i = 0; i < count; i++) ctx.lineTo(px(i), py(i))
      ctx.lineTo(px(count - 1), height)
      ctx.closePath()
      ctx.globalAlpha = 0.28
      ctx.fillStyle = gradient
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(px(0), py(0))
      for (var j = 1; j < count; j++) ctx.lineTo(px(j), py(j))
      ctx.globalAlpha = 1
      ctx.lineWidth = graph.lineWidth
      ctx.lineJoin = "round"
      ctx.strokeStyle = gradient
      ctx.stroke()
    }
  }
}
