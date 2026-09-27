# Display Reserve for Omarchy

Blacks out display edges you can't reach (for example, the top of a tall
rotated monitor) and keeps the Omarchy bar and tiled windows in the area you
can reach.

Click the monitor icon in the bar to open the panel. It edits the monitor the
bar is on; use the monitor buttons (or Tab) to switch. Changes apply live.

- **Preview**: the monitor drawn to scale, with the black edges, the
  reachable area and where the bar will sit. Drag any edge to resize it
  (hold Shift for 1 px precision), or scroll over it.
- **Edge rows**: a slider for quick moves and a field for exact pixels.
- **Switch**: pauses a monitor's reservation without forgetting the values.
  Right-clicking the bar icon does the same for the bar's monitor.
- **Clear**: removes every reserved edge on the monitor.

| Key | Action |
| --- | --- |
| `j` / `k`, ↓ / ↑ | Select an edge |
| `h` / `l`, ← / → | Shrink or grow it by 10 px (Shift: 100, Ctrl: 1) |
| `0`, Backspace | Zero the selected edge |
| Space, `p` | Pause or resume the monitor |
| Tab / Shift+Tab | Next or previous monitor |
| Esc, `q` | Close |

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

A paused monitor also stores `"enabled": false`. The file is watched, so you
can edit it by hand.

The popout is shifted by the reserved edges on the bar's monitor so it opens
beside the bar, not inside the black cap. Omarchy's own popouts (clock, audio
and others) assume the bar sits at the screen edge, so on a reserved monitor
they still open inside the cap.

## Development

```bash
npm test                        # pure model tests
omarchy plugin validate .
```

## Install

```bash
omarchy plugin add file:///home/pym/Projects/omarchy-display-reserve --enable --yes
```

After installing, add the **Display Reserve** widget to the bar.

## Upgrading from 0.1

Version 0.1 wrote `reserved_area = { … }` into `monitors.lua`. Remove it (or
set it to zeros), or the edge will be reserved twice.
