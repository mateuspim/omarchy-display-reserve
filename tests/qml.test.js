import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Qt's AutoText can load images from markup. Keep every plugin-owned Text
// plain, including future fields that may receive metadata or saved names.
for (const file of ["Panel.qml", "Ruler.qml", "StatsCard.qml"]) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
  const textItems = [...source.matchAll(/\bText\s*\{/g)]
  assert.ok(textItems.length > 0, file)
  for (const match of textItems) {
    const body = source.slice(match.index, source.indexOf("}", match.index))
    assert.match(body, /\btextFormat:\s*Text\.PlainText\b/, `${file} Text at offset ${match.index} must render plain text`)
  }
  console.log(`${file}: ${textItems.length} text items render plain text`)
}
