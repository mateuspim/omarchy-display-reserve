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
  readonly property bool horizontal: Model.isHorizontal(side)
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
    visible: fill.mode === "logo" && svg !== "" && layout.width / aspect >= 4
    anchors.centerIn: parent
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
}
