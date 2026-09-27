# Display Reserve for Omarchy

Blacks out display edges you can't reach (for example, the top of a tall
rotated monitor) and keeps the Omarchy bar and tiled windows in the area you
can reach.

<p align="center">
  <img src="docs/screenshot.png" width="360"
       alt="A portrait monitor with its top 400 pixels blacked out; the Omarchy bar and a browser window sit just below the black edge">
</p>

## Install

```bash
omarchy plugin add https://github.com/mateuspim/omarchy-display-reserve.git --enable --yes
```

Then add the **Display Reserve** widget to the bar.

To update, pull the new version and restart the shell. The service stays
loaded while plugins reload, so the black edges never flicker, but that also
means the new version only takes over after a restart:

```bash
omarchy plugin update pym.display-reserve --yes && sleep 3 && omarchy restart shell
```

The `sleep` gives the shell's plugin reload time to finish. Restarting in the
middle of it can crash the old shell on its way out; the shell comes back on
its own, but there's no reason to trigger it.

To uninstall, run `omarchy plugin remove pym.display-reserve`. Your saved
reservations stay in `~/.config/omarchy/display-reserve.json` until you
delete it.

## Usage

Click the monitor icon in the bar to open the panel. It edits the monitor the
bar is on; use the monitor buttons (or Tab) to switch. Changes apply live.

- **Preview**: the monitor drawn to scale, with the black edges, the
  reachable area and where the bar will sit. Drag any edge to resize it
  (hold Shift for 1 px precision), or scroll over it (Shift: ×10).
- **Edge rows**: a slider for quick moves and a field for exact pixels.
  While you type in a field, keys go to the field; Enter, Esc or Tab
  applies the value and returns to the shortcuts below.
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

Opposite edges share a budget: together, top and bottom (or left and right)
can reserve at most 90% of that axis, so the bar and the panel always have
room. Values that exceed it, for example from a hand edit or after a
monitor switches to a smaller mode, are trimmed when drawn.

## How it works

Each reserved edge gets two layer-shell surfaces from the `Service.qml` service:

| Surface | Layer | Purpose |
| --- | --- | --- |
| `pym-display-reserve-spacer` | Bottom | Its exclusive zone reserves the edge. Hyprland lays out exclusive zones from the lowest layer up, so this claims the edge before the Top-layer bar. The bar lands just inside the reachable area, and tiled windows come after it. |
| `pym-display-reserve` | Overlay | A black strip that blocks pointer input and covers fullscreen or floating windows that stray into the reserved area. |

Fullscreen windows ignore exclusive zones, so the cap hides the part of a
fullscreen window under a reserved edge instead of shifting it. The spacer
still keeps tiled and maximized windows in the reachable area.

Because the plugin reserves space itself, it never edits
`~/.config/hypr/monitors.lua` or runs `hyprctl reload`.

Reservations are stored in `~/.config/omarchy/display-reserve.json` in
logical pixels, keyed by the monitor's Hyprland description (make, model
and serial, as in `hyprctl monitors`), so they follow the monitor when a
dock renumbers its connectors:

```json
{ "outputs": { "Dell Inc. DELL U2720Q 1A2B3C4": { "top": 350, "bottom": 0, "left": 0, "right": 0 } } }
```

A monitor with no description, or one that shares its description with
another connected monitor, is keyed by its connector name (`DP-4`) instead.
Entries keyed by connector name, as older versions wrote them, are still
read and move to the description on the next edit.

A paused monitor also stores `"enabled": false`. The file is watched, so you
can edit it by hand; an edit made in the 200 ms after a change in the panel
is overwritten by that change.

The popout takes the reserved edges into account: it opens beside the bar,
not inside the black cap, and stays clear of the caps on either side. While
the bar is pushed inwards, clicking another bar icon with the popout open
closes it instead of switching straight to that icon's popout. Omarchy's own
popouts (clock, audio and others) assume the bar sits at the screen edge, so
on a reserved monitor they still open inside the cap.

## Upgrading from 0.1

Version 0.1 wrote `reserved_area = { … }` into `monitors.lua`. Remove it (or
set it to zeros), or the edge will be reserved twice.
