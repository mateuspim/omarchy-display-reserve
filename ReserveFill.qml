import QtQuick
import qs.Commons
import "." as Reserve
import "Model.js" as Model

// What one reserved edge shows, drawn over black (or the theme background)
// so a missing or loading image falls back to the plain cap. The service draws it at screen size;
// the panel preview draws the same thing scaled down, so `size`,
// `screenWidth` and `screenHeight` are in whatever units the parent uses.
Rectangle {
  id: fill
  required property string side
  required property string mode
  required property real size
  required property real screenWidth
  required property real screenHeight
  property color logoColor: Color.foreground
  property color clockColor: Color.accent
  readonly property bool horizontal: Model.isHorizontal(side)
  // The time the clock shows, and what the clock and the logo shift by
  // against burn-in (clockShift). Only ticks while one of them is shown.
  property date now: new Date()
  readonly property var shift: Model.clockShift(now)
  color: mode === "theme" ? Color.background : "black"
  clip: true

  // The slice of the wallpaper that would be on screen here, scaled and
  // cropped the way Omarchy's background layer does it.
  Image {
    readonly property var offset: Model.imageOffset(fill.side, fill.size, fill.screenWidth, fill.screenHeight)
    visible: Model.showsWallpaper(fill.mode)
    x: offset.x
    y: offset.y
    width: fill.screenWidth
    height: fill.screenHeight
    source: visible ? Util.fileUrl(Reserve.ReserveState.wallpaper) : ""
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    cache: true
    smooth: true
    mipmap: true

    // The dimmed fill: the same slice under a translucent black.
    Rectangle {
      anchors.fill: parent
      visible: fill.mode === "dim"
      color: "black"
      opacity: 0.6
    }
  }

  // The Omarchy logo, centered and upright: the wordmark on the top and
  // bottom edges, the icon over it on the sides. The SVG is drawn in black, so its fill is
  // swapped for the theme's foreground; the icon is block art, drawn in it.
  Column {
    id: logo
    readonly property string svg: Reserve.ReserveState.logoSvg
    readonly property real aspect: Model.svgAspect(svg, 4)
    readonly property var layout: Model.logoLayout(fill.width, fill.height, aspect, Reserve.ReserveState.iconArt, !fill.horizontal)
    readonly property real step: Model.logoStep(width, height)
    visible: fill.mode === "logo" && svg !== "" && layout.width / aspect >= 4
    x: Math.round((fill.width - width) / 2 + fill.shift.x * step)
    y: Math.round((fill.height - height) / 2 + fill.shift.y * step)
    spacing: layout.gap

    Item {
      visible: logo.layout.stacked
      width: logo.layout.width
      height: visible ? Reserve.ReserveState.iconArt.rows * logo.layout.cell : 0
      Repeater {
        model: logo.visible && logo.layout.stacked ? Reserve.ReserveState.iconArt.cells : []
        Rectangle {
          required property var modelData
          x: modelData.x * logo.layout.cell
          y: modelData.y * logo.layout.cell
          width: logo.layout.cell
          height: logo.layout.cell
          color: fill.logoColor
        }
      }
    }

    Image {
      width: logo.layout.width
      height: logo.layout.width / logo.aspect
      source: logo.visible
        ? "data:image/svg+xml;base64," + Qt.btoa(Model.recolorSvg(logo.svg, Model.hexColor(fill.logoColor.r, fill.logoColor.g, fill.logoColor.b)))
        : ""
      sourceSize.width: Math.ceil(width)
      sourceSize.height: Math.ceil(height)
      fillMode: Image.PreserveAspectFit
      smooth: true
    }
  }

  // A 24-hour clock in big blocky digits, always upright: one line on a
  // wide strip, hours over minutes on a tall one. It ticks on the minute
  // and moves a few pixels every few minutes, against burn-in.
  Item {
    id: clock
    readonly property var layout: Model.clockLayout(Model.clockText(fill.now), fill.width, fill.height)
    readonly property real cell: layout.cell
    visible: fill.mode === "clock" && cell >= 1
    width: layout.columns * cell
    height: layout.rows * cell
    // A twelfth of a block per step: enough to spread the wear, too little
    // to look off-center.
    x: Math.round((fill.width - width) / 2 + fill.shift.x * cell / 12)
    y: Math.round((fill.height - height) / 2 + fill.shift.y * cell / 12)

    Repeater {
      model: clock.visible ? clock.layout.cells : []
      Rectangle {
        required property var modelData
        x: modelData.x * clock.cell
        y: modelData.y * clock.cell
        width: clock.cell
        height: clock.cell
        color: fill.clockColor
      }
    }
  }

  // A new interval restarts it, so every tick re-aims at the next minute.
  Timer {
    running: clock.visible || logo.visible
    repeat: true
    interval: Model.untilNextMinute(fill.now) + 50
    onTriggered: fill.now = new Date()
    // Deferred: the clock's `visible` reads its layout, which reads `now`.
    onRunningChanged: if (running) Qt.callLater(function() { fill.now = new Date() })
  }
}
