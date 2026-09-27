# Display Reserve for Omarchy

Blacks out display edges you can't reach (for example, the top of a tall
rotated monitor) and keeps the Omarchy bar and tiled windows in the area you
can reach.

Click the monitor icon in the bar to open the panel. Pick a monitor (it
defaults to the one the bar is on) and set how many pixels to reserve on
each edge. Changes apply as you edit, and **Clear** removes every reservation
for that monitor. Press Esc or `q` to close the panel.

## How it works

Each reserved edge gets two layer-shell surfaces from the `Service.qml` service:

| Surface | Layer | Purpose |
| --- | --- | --- |
| `pym-display-reserve-spacer` | Bottom | Its exclusive zone reserves the edge. Hyprland lays out exclusive zones from the lowest layer up, so this claims the edge before the Top-layer bar. The bar lands just inside the reachable area, and tiled windows come after it. |
| `pym-display-reserve` | Overlay | A black strip that blocks pointer input and covers fullscreen or floating windows that stray into the reserved area. |

Because the plugin reserves space itself, it never edits
`~/.config/hypr/monitors.lua` or runs `hyprctl reload`.

Reservations are stored in `~/.config/omarchy/display-reserve.json`, keyed by
output name and measured in logical pixels:

```json
{ "outputs": { "DP-4": { "top": 350, "bottom": 0, "left": 0, "right": 0 } } }
```

The file is watched, so you can also edit it by hand.

## Install

```bash
omarchy plugin add file:///home/pym/Projects/omarchy-display-reserve --enable --yes
```

After installing, add the **Display Reserve** widget to the bar.

## Upgrading from 0.1

Version 0.1 wrote `reserved_area = { … }` into `monitors.lua`. Remove it (or
set it to zeros), or the edge will be reserved twice.
