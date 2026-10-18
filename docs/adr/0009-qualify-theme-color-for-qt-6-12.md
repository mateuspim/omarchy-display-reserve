# 9. Qualify the theme `Color` as `Commons.Color` (Qt 6.12)

- Status: Accepted
- Date: 2026-10-18 (`3c46080`)

## Context

The plugin's QML used Omarchy's theme singleton from `qs.Commons`
unqualified (`Color.accent`). Qt 6.12's `QtQuick` exports its own `Color`,
which wins the unqualified lookup, so the theme fill, the logo, the clock
and the ruler got undefined colors.

## Decision

Like Omarchy's own Ui kit, every QML file that uses theme colors imports
`qs.Commons as Commons` and writes `Commons.Color.…`. The unqualified
`import qs.Commons` stays for `Style`.

## Consequences

- Colors resolve the same on Qt 6.12 and earlier.
- An unqualified `Color.x` breaks silently (no load error, just undefined
  colors), so reviews and offscreen renders have to catch it.
