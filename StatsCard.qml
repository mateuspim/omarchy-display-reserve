import QtQuick
import QtQuick.Layouts
import qs.Commons
import "." as Reserve
import "Stats.js" as Stats

// One panel of the stats dashboard, drawn the way btop draws its boxes: a
// thin rounded outline in the panel's color with the title cut into its
// top edge, over black. `view` is Stats.view's description of the panel.
// A wide card puts its value and graphs on the left and its rows on the
// right; a narrow one stacks them.
Item {
  id: card
  required property var view
  required property var palette
  required property int unit
  property string fontFamily: Style.font.family
  readonly property bool wide: width > height * Stats.WIDE_CARD
  readonly property int line: Math.max(1, Math.round(unit / 12))

  Rectangle {
    anchors.fill: parent
    anchors.topMargin: Math.round(card.unit / 2)
    color: "transparent"
    radius: Math.round(card.unit * 0.55)
    border.color: card.view.color
    border.width: card.line
    opacity: 0.75
  }

  // The title, and on the right the panel's detail (a GPU's name, the
  // number of threads), each on a black patch over the outline.
  Rectangle {
    x: card.unit
    height: card.unit
    width: titleRow.implicitWidth + card.unit * 0.7
    color: "black"
    Row {
      id: titleRow
      anchors.centerIn: parent
      spacing: Math.round(card.unit * 0.4)
      Text {
        text: card.view.icon
        color: card.view.color
        font.family: card.fontFamily
        font.pixelSize: card.unit
      }
      Text {
        text: card.view.title
        color: card.palette.foreground
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 0.9)
        font.bold: true
      }
    }
  }
  Rectangle {
    visible: card.view.info !== ""
    anchors.right: parent.right
    anchors.rightMargin: card.unit
    height: card.unit
    width: Math.min(infoText.implicitWidth, card.width / 2) + card.unit * 0.7
    color: "black"
    Text {
      id: infoText
      anchors.centerIn: parent
      width: Math.min(implicitWidth, card.width / 2)
      text: card.view.info
      elide: Text.ElideRight
      color: card.palette.subtle
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.8)
    }
  }

  GridLayout {
    id: body
    anchors.fill: parent
    anchors.margins: card.unit
    anchors.topMargin: Math.round(card.unit * 1.6)
    columns: card.wide ? 2 : 1
    columnSpacing: card.unit * 1.2
    rowSpacing: Math.round(card.unit * 0.5)
    visible: card.view.empty === ""
    clip: true

    // The headline: the big value, its graphs and the per-core bars.
    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      Layout.preferredWidth: 1
      spacing: Math.round(card.unit * 0.4)
      visible: card.view.value !== "" || card.view.graphs.length > 0 || card.view.bars.length > 0

      RowLayout {
        visible: card.view.value !== ""
        spacing: Math.round(card.unit * 0.5)
        TextMetrics {
          id: widest
          text: "100%"
          font.family: card.fontFamily
          font.pixelSize: Math.round(card.unit * 2.2)
          font.bold: true
        }
        Text {
          // As wide as the widest value, so the caption holds still.
          Layout.minimumWidth: widest.width
          text: card.view.value
          color: card.view.valueColor
          font.family: card.fontFamily
          font.pixelSize: Math.round(card.unit * 2.2)
          font.bold: true
        }
        Text {
          Layout.alignment: Qt.AlignBottom
          Layout.bottomMargin: Math.round(card.unit * 0.3)
          text: card.view.caption
          color: card.palette.subtle
          font.family: card.fontFamily
          font.pixelSize: Math.round(card.unit * 0.8)
        }
      }

      // Each repeater counts the view's items rather than taking its
      // arrays, which are new every second: its delegates then stay, and
      // their meters and graphs move instead of being made again.
      Repeater {
        model: card.view.graphs.length
        Item {
          required property int index
          readonly property var modelData: card.view.graphs[index] || ({ values: [], max: 1, stops: card.palette.gradients.cpu, label: "" })
          Layout.fillWidth: true
          Layout.fillHeight: true
          Layout.minimumHeight: card.unit * 1.5
          Reserve.StatsGraph {
            anchors.fill: parent
            values: parent.modelData.values
            maximum: parent.modelData.max
            stops: parent.modelData.stops
            duration: Reserve.ReserveState.stats.interval * 1000
            guideColor: card.palette.line
            lineWidth: Math.max(1.5, card.unit / 9)
          }
          Text {
            visible: parent.modelData.label !== ""
            x: Math.round(card.unit * 0.3)
            y: Math.round(card.unit * 0.1)
            text: parent.modelData.label
            color: parent.modelData.stops[1]
            font.family: card.fontFamily
            font.pixelSize: Math.round(card.unit * 0.85)
            font.bold: true
            style: Text.Outline
            styleColor: "black"
          }
        }
      }

      // One bar per core, filled from the bottom.
      Row {
        id: cores
        visible: card.view.bars.length > 0
        Layout.fillWidth: true
        Layout.preferredHeight: Math.round(card.unit * 1.8)
        spacing: Math.max(1, Math.round(card.unit / 8))
        Repeater {
          model: card.view.bars.length
          Rectangle {
            required property int index
            readonly property var modelData: card.view.bars[index] || ({ fraction: 0, color: card.palette.meter })
            width: (cores.width - cores.spacing * (card.view.bars.length - 1)) / card.view.bars.length
            height: cores.height
            radius: Math.min(width / 2, card.unit / 6)
            color: card.palette.meter
            // The fraction eases, not the size: an eased size would keep
            // a stale track size when the card is laid out again.
            property real shown: modelData.fraction
            Behavior on shown { NumberAnimation { duration: 800; easing.type: Easing.InOutQuad } }
            Rectangle {
              anchors.bottom: parent.bottom
              width: parent.width
              height: Math.max(parent.radius * 2, parent.height * parent.shown)
              radius: parent.radius
              color: parent.modelData.color
            }
          }
        }
      }
    }

    // The details: label, meter and value rows, then ranked lists.
    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: card.wide
      Layout.preferredWidth: 1
      Layout.alignment: Qt.AlignTop
      spacing: Math.round(card.unit * 0.35)
      visible: card.view.rows.length > 0 || card.view.lists.length > 0

      Repeater {
        model: card.view.rows.length
        StatRow {
          required property int index
          readonly property var modelData: card.view.rows[index] || ({ label: "", text: "", fraction: null, color: "" })
          Layout.fillWidth: true
          label: modelData.label
          text: modelData.text
          fraction: modelData.fraction
          barColor: modelData.color || card.view.color
          labelWidth: card.unit * 5.5
        }
      }

      Repeater {
        model: card.view.lists.length
        ColumnLayout {
          id: list
          required property int index
          readonly property var modelData: card.view.lists[index] || ({ title: "", items: [] })
          Layout.fillWidth: true
          spacing: Math.round(card.unit * 0.3)
          Text {
            text: list.modelData.title
            color: card.view.color
            font.family: card.fontFamily
            font.pixelSize: Math.round(card.unit * 0.8)
            font.bold: true
          }
          Repeater {
            model: list.modelData.items.length
            StatRow {
              required property int index
              readonly property var modelData: list.modelData.items[index] || ({ name: "", text: "", fraction: null, color: "" })
              Layout.fillWidth: true
              label: modelData.name
              text: modelData.text
              fraction: modelData.fraction
              barColor: modelData.color
              labelFills: true
              meterWidth: card.unit * 4
            }
          }
          Text {
            visible: list.modelData.items.length === 0
            text: "Nothing busy"
            color: card.palette.subtle
            font.family: card.fontFamily
            font.pixelSize: Math.round(card.unit * 0.85)
          }
        }
      }
      Item { Layout.fillHeight: true; visible: card.wide }
    }
  }

  // Now playing: the cover beside the title, artist, album and a progress
  // bar with the time.
  Item {
    id: media
    readonly property var track: card.view.media || null
    visible: track !== null && card.view.empty === ""
    anchors.fill: parent
    anchors.margins: card.unit
    anchors.topMargin: Math.round(card.unit * 1.6)

    Rectangle {
      id: cover
      width: Math.min(parent.height, parent.width * 0.4)
      height: width
      anchors.verticalCenter: parent.verticalCenter
      radius: Math.round(card.unit * 0.4)
      color: card.palette.meter
      visible: width >= card.unit * 3
      Text {
        anchors.centerIn: parent
        visible: art.status !== Image.Ready
        text: card.view.icon
        color: card.view.color
        font.family: card.fontFamily
        font.pixelSize: Math.round(parent.width * 0.4)
      }
      Image {
        id: art
        anchors.fill: parent
        source: media.track ? media.track.art : ""
        sourceSize.width: Math.ceil(width)
        sourceSize.height: Math.ceil(height)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        smooth: true
      }
    }

    Column {
      anchors.left: cover.visible ? cover.right : parent.left
      anchors.leftMargin: cover.visible ? card.unit : 0
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: Math.round(card.unit * 0.35)
      Text {
        width: parent.width
        text: media.track ? media.track.title : ""
        elide: Text.ElideRight
        color: card.palette.foreground
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 1.3)
        font.bold: true
      }
      Text {
        width: parent.width
        visible: text !== ""
        text: media.track ? media.track.artist : ""
        elide: Text.ElideRight
        color: card.view.color
        font.family: card.fontFamily
        font.pixelSize: card.unit
      }
      Text {
        width: parent.width
        visible: text !== ""
        text: media.track ? media.track.album : ""
        elide: Text.ElideRight
        color: card.palette.subtle
        font.family: card.fontFamily
        font.pixelSize: Math.round(card.unit * 0.85)
      }
      Item { width: 1; height: Math.round(card.unit * 0.3) }
      StatRow {
        width: parent.width
        label: media.track && media.track.playing ? "\u{f040a}" : "\u{f03e4}"
        labelWidth: card.unit * 1.6
        text: media.track ? media.track.time : ""
        fraction: media.track ? media.track.progress : null
        barColor: card.view.color
      }
    }
  }

  Text {
    anchors.centerIn: parent
    visible: card.view.empty !== ""
    text: card.view.empty
    color: card.palette.subtle
    font.family: card.fontFamily
    font.pixelSize: card.unit
  }

  // Label, a meter when there is a fraction, and the value on the right.
  // With `labelFills` the label takes the free width and the meter a fixed
  // one, as in the process lists.
  component StatRow: Item {
    id: statRow
    property string label
    property string text
    property var fraction: null
    property color barColor
    property real labelWidth: 0
    property bool labelFills: false
    property real meterWidth: 0
    readonly property bool hasMeter: fraction !== null && fraction !== undefined
    implicitHeight: Math.round(card.unit * 1.25)

    Text {
      id: rowLabel
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      // Never into the value: a long value takes the room of the meter,
      // then of the label, which elides.
      width: statRow.labelFills ? parent.width - value.width - meter.width - card.unit * 1.2
        : Math.max(0, Math.min(statRow.labelWidth, parent.width - value.width - card.unit * 0.6))
      text: statRow.label
      elide: Text.ElideRight
      color: card.palette.subtle
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.9)
    }
    Rectangle {
      id: meter
      visible: statRow.hasMeter
      anchors.verticalCenter: parent.verticalCenter
      x: statRow.labelFills ? rowLabel.width + card.unit * 0.6 : rowLabel.width
      width: !statRow.hasMeter ? 0 : statRow.labelFills ? statRow.meterWidth : Math.max(0, value.x - x - card.unit * 0.6)
      height: Math.max(3, Math.round(card.unit * 0.42))
      radius: height / 2
      color: card.palette.meter
      property real shown: statRow.fraction || 0
      Behavior on shown { NumberAnimation { duration: 800; easing.type: Easing.InOutQuad } }
      Rectangle {
        width: Math.max(parent.height, parent.width * parent.shown)
        height: parent.height
        radius: parent.radius
        color: statRow.barColor
      }
    }
    Text {
      id: value
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: statRow.text
      color: card.palette.foreground
      font.family: card.fontFamily
      font.pixelSize: Math.round(card.unit * 0.9)
      font.bold: true
    }
  }
}
