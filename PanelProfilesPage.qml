import QtQuick
import qs.Ui
import qs.Commons
import "Model.js" as Model

// The panel's Profiles page: named snapshots of every monitor. A chip
// applies one, and the one on screen is selected; the field below names
// one to save, and Auto ties it to the monitors connected now.
Column {
  id: page
  // The Panel this page edits: its profiles and their functions.
  required property var panel
  spacing: Style.spacing.sm

  // Puts the cursor in the name field, for the `s` key.
  function focusField() { profileField.forceActiveFocus() }

  PanelSectionHeader {
    text: "PROFILES"
    foreground: page.panel.foreground
    fontFamily: page.panel.fontFamily
  }
  Text {
    visible: page.panel.profileNames.length === 0
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "No profiles yet. Name one below to save every monitor as it is now."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
  Flow {
    visible: page.panel.profileNames.length > 0
    width: parent.width
    spacing: Style.spacing.md
    Repeater {
      model: page.panel.profileNames
      Button {
        required property string modelData
        required property int index
        // Auto shows on the chip, not only in its tooltip.
        text: modelData + (page.panel.reserve.isAuto(modelData) ? "  ·  auto" : "")
        iconText: index < 9 ? String(index + 1) : ""
        tooltipText: "Apply " + modelData + " to every monitor" + (index < 9 ? "  ·  " + (index + 1) : "")
          + (page.panel.reserve.autoProfiles[modelData] ? "\nApplied by itself with " + page.panel.reserve.autoProfiles[modelData].join(", ") : "")
          + "\nRight click to delete"
        selected: page.panel.reserve.currentProfile === modelData
        bordered: true
        foreground: page.panel.foreground
        fontFamily: page.panel.fontFamily
        onClicked: { page.panel.applyProfile(modelData); page.panel.refocus() }
        onRightClicked: { page.panel.deleteProfile(modelData); page.panel.refocus() }
      }
    }
  }
  Item {
    width: parent.width
    height: Math.max(profileField.implicitHeight, saveProfileButton.implicitHeight)
    TextField {
      id: profileField
      anchors.left: parent.left
      anchors.right: autoButton.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      placeholderText: "Profile name"
      // The Panel owns the name, so applying a profile or reopening the
      // panel can set it.
      text: page.panel.profileDraft
      onTextChanged: page.panel.profileDraft = text
      foreground: page.panel.foreground
      font.family: page.panel.fontFamily
      maximumLength: 32
      onAccepted: { page.panel.saveProfile(text); page.panel.refocus() }
    }
    // Ties the named profile to the monitors connected now.
    Button {
      id: autoButton
      readonly property string existing: Model.findProfile(page.panel.reserve.profiles, profileField.text)
      anchors.right: saveProfileButton.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      text: "Auto"
      iconText: "󰁪"
      enabled: existing !== ""
      opacity: enabled ? 1 : 0.4
      selected: enabled && page.panel.reserve.isAuto(existing)
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: !enabled ? "Name a saved profile to apply it by itself when these monitors connect"
        : selected ? existing + " applies by itself whenever exactly these monitors connect. Click to stop"
        : "Apply " + existing + " by itself whenever exactly these monitors connect: " + page.panel.screenNames.join(", ")
      onClicked: { page.panel.reserve.setAuto(existing, !selected); page.panel.refocus() }
    }
    Button {
      id: saveProfileButton
      readonly property string name: Model.profileName(profileField.text)
      readonly property string existing: Model.findProfile(page.panel.reserve.profiles, name)
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: existing ? "Update" : "Save"
      iconText: "󰆓"
      enabled: name !== ""
      opacity: enabled ? 1 : 0.4
      bordered: true
      foreground: page.panel.foreground
      fontFamily: page.panel.fontFamily
      tooltipText: existing ? "Save every monitor as it is now over " + existing : "Save every monitor as it is now under this name"
      onClicked: { page.panel.saveProfile(profileField.text); page.panel.refocus() }
    }
  }
  // What the buttons above do, which their names alone don't say.
  Text {
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "A profile holds every monitor's edges and fill; 1 – 9 apply one. Auto applies it by itself whenever exactly these monitors connect. Right-click a profile to delete it."
    color: page.panel.subtle
    font.family: page.panel.fontFamily
    font.pixelSize: Style.font.caption
  }
}
