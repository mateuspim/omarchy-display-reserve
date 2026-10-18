# 3. Throttle what is applied, and hold it during drags

- Status: Accepted
- Date: 2026-09-27 (`92bacad`)

## Context

Every change to an exclusive zone re-tiles each window on the monitor and
moves the bar. Dragging a slider or an edge in the preview sends dozens of
changes a second, which made windows thrash.

## Decision

`ReserveState` keeps two copies: `outputs`, what the user set, and
`applied`, what the service draws and Hyprland reserves. `applied` trails
`outputs` by at most 100 ms, and not at all while a drag holds it; letting go
applies the final value at once. The panel's preview follows `outputs` and
stays live throughout. Saving to disk is debounced separately and flushed
when the panel closes.

## Consequences

- Drags are smooth and windows re-tile once at the end.
- Code that asks "what is on screen" must read `appliedEdges`, not
  `activeEdges`.
