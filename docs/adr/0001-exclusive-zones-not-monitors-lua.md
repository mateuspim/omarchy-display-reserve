# 1. Reserve edges with layer-shell exclusive zones, not monitors.lua

- Status: Accepted
- Date: 2026-09-27 (`2eb2727`)

## Context

The first version reserved edges by rewriting the monitor's reserved area in
`~/.config/hypr/monitors.lua` through a Python helper, then running
`hyprctl reload`. That edited the user's own config, reloaded all of
Hyprland on every change, and still put the Omarchy bar under the black cap,
since the bar anchors to the monitor edge.

## Decision

Each reserved edge gets two layer-shell surfaces from the plugin's service:

- a **Bottom-layer spacer** whose exclusive zone does the reserving.
  Hyprland lays out exclusive zones from the lowest layer up, so the spacer
  claims the edge before the Top-layer bar, which lands just inside the
  reachable area with tiled windows after it;
- an **Overlay-layer cap** over the same strip that blocks the pointer,
  covers anything that strays into it and draws the monitor's fill.

An edge at 0 has no surfaces at all.

## Consequences

- No config file is edited and nothing reloads; changes apply live.
- Uninstalling the plugin removes every reserve with it.
- Fullscreen windows ignore exclusive zones, which needed its own fix
  ([ADR 5](0005-fit-fullscreen-to-the-reachable-area.md)).
- Omarchy's own popouts still assume the bar is at the screen edge (a known
  limitation in the README).
