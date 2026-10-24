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
