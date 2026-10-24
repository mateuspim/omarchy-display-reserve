import { readFileSync } from "node:fs"
import vm from "node:vm"

// Runs a QML `.pragma library` script as a plain script and returns its
// sandbox, where its functions land. The script's `.import "X.js" as Name`
// lines are dropped; `imports` supplies each Name, already loaded.
export function load(file, imports = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8")
    .replace(/^\.pragma library\s*/, "")
    .replace(/^\.import\s+"[^"]+"\s+as\s+\w+\s*$/gm, "")
  const sandbox = Object.assign({}, imports)
  vm.runInNewContext(source, sandbox)
  return sandbox
}
