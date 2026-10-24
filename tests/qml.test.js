import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"

// Qt's AutoText can load images from markup. Keep every plugin-owned Text
// plain, including future fields that may receive metadata or saved names.
// Every .qml file at the root, so a new page or card is checked too.
const files = readdirSync(new URL("..", import.meta.url)).filter(name => name.endsWith(".qml")).sort()
assert.ok(files.includes("Panel.qml") && files.includes("StatsCard.qml"))
for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
  const textItems = [...source.matchAll(/\bText\s*\{/g)]
  if (!textItems.length) continue
  for (const match of textItems) {
    const body = source.slice(match.index, source.indexOf("}", match.index))
    assert.match(body, /\btextFormat:\s*Text\.PlainText\b/, `${file} Text at offset ${match.index} must render plain text`)
  }
  console.log(`${file}: ${textItems.length} text items render plain text`)
}

// A property named like one every Item already has does not load: "data"
// is read-only, and the component fails ("Invalid property assignment"),
// taking the panel with it. Names Item and its QtObject base declare.
const ITEM_PROPERTIES = ["data", "children", "resources", "parent", "state", "states", "transitions", "visible", "enabled",
  "opacity", "width", "height", "x", "y", "z", "scale", "rotation", "clip", "focus", "palette", "layer", "anchors", "objectName"]
// Roots that are not Items (Service.qml's Scope, the state singleton)
// may use those names.
const NOT_ITEMS = ["Scope", "Singleton", "QtObject", "ShellRoot"]
for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
  const root = (/^([A-Z]\w*)\s*\{/m.exec(source) || [])[1]
  if (NOT_ITEMS.includes(root)) continue
  for (const match of source.matchAll(/^\s*(?:readonly\s+|required\s+|default\s+)*property\s+\S+\s+(\w+)/gm))
    assert.ok(!ITEM_PROPERTIES.includes(match[1]), `${file} declares a property named ${match[1]}, which Item already has`)
}
console.log("no property shadows one of Item's")
