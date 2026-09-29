# Display Reserve for Omarchy

Blacks out display edges you can't reach (for example, the top of a tall
rotated monitor) and keeps the Omarchy bar and tiled windows in the area you
can reach.

<p align="center">
  <img src="docs/screenshot.png" width="360"
       alt="A portrait monitor with its top 400 pixels blacked out; the Omarchy bar and a browser window sit just below the black edge">
</p>

Requires Omarchy 4 with its Quickshell bar and shell plugins (tested on
4.0.4 with Hyprland 0.56).

## Install

```bash
omarchy plugin add https://github.com/mateuspim/omarchy-display-reserve.git --enable --yes
```

A monitor icon appears on the right of the bar. To put it elsewhere, run
`omarchy plugin enable pym.display-reserve --section left` (or `center`).

To update, pull the new version and restart the shell. The black edges stay
up while plugins reload, so the new version only takes over after a restart:

```bash
omarchy plugin update pym.display-reserve --yes && sleep 3 && omarchy restart shell
```

Keep the `sleep`: restarting while the shell is still reloading plugins can
crash the old shell on its way out. It comes back on its own, but there's no
reason to trigger it.

To uninstall, run `omarchy plugin remove pym.display-reserve`. Your saved
reservations stay in `~/.config/omarchy/display-reserve.json` until you
delete it.

## Usage

Click the monitor icon in the bar to open the panel. It edits the monitor the
bar is on; use the monitor buttons (or Tab) to switch. Changes apply live.

<p align="center">
  <img src="docs/panel.png" width="360"
       alt="The Display Reserve panel for DP-4: a to-scale preview of a portrait monitor with its top 400 pixels black, and a slider and pixel field for each edge">
</p>

- **Preview**: the monitor drawn to scale, with the black edges, the
  reachable area and where the bar will sit. Drag an edge to resize it
  (hold Shift for 1 px precision), or scroll over it (Shift: ×10).
- **Edge rows**: a slider for quick moves and a field for exact pixels.
  While you type in a field, keys go to the field; Enter, Esc or Tab
  applies the value and returns to the shortcuts below.
- **Switch**: pauses a monitor's reservation without forgetting the values.
  Right-clicking the bar icon does the same for the bar's monitor.
- **Clear**: removes every reserved edge on the monitor. Right after a
  Clear, or zeroing an edge, the button turns into **Undo**.

Values are in logical pixels. On a scaled monitor the panel shows the scale
next to the edges, since a ruler on the screen measures something else.

| Key | Action |
| --- | --- |
| `j` / `k`, ↓ / ↑ | Select an edge |
| `h` / `l`, ← / → | Shrink or grow it by 10 px (Shift: 100, Ctrl: 1) |
| `0`, Backspace, Delete | Zero the selected edge |
| `u`, Ctrl+Z | Undo a Clear or a zeroed edge |
| Space, `p` | Pause or resume the monitor |
| Tab / Shift+Tab | Next or previous monitor |
| `?` | Show or hide these shortcuts in the panel |
| Esc, `q` | Close (Esc closes the shortcut sheet first) |

Opposite edges share a budget: together, top and bottom (or left and right)
can reserve at most 90% of the screen, so the bar and the panel always have
room. Values over the budget, for example from a hand edit or after a
monitor switches to a smaller mode, are trimmed when drawn.

## How it works

Each reserved edge gets two layer-shell surfaces:

| Surface | Layer | Purpose |
| --- | --- | --- |
| `pym-display-reserve-spacer` | Bottom | Reserves the edge with an exclusive zone. Hyprland lays out exclusive zones from the lowest layer up, so this claims the edge before the Top-layer bar, which lands just inside the reachable area with tiled windows after it. |
| `pym-display-reserve` | Overlay | A black strip that blocks the pointer and covers anything that strays into the reserved area. |

Fullscreen windows ignore exclusive zones, so the black strip hides the part
of a fullscreen window under a reserved edge instead of shifting it.

The plugin never edits `~/.config/hypr/monitors.lua` or runs
`hyprctl reload`.

### Saved settings

Reservations are stored in `~/.config/omarchy/display-reserve.json`, keyed
by the monitor's Hyprland description (make, model and serial, as in
`hyprctl monitors`), so they follow the monitor when a dock renumbers its
connectors:

```json
{ "outputs": { "Dell Inc. DELL U2720Q 1A2B3C4": { "enabled": true, "top": 350, "bottom": 0, "left": 0, "right": 0 } } }
```

A monitor with no description, or one that shares its description with
another connected monitor, is keyed by its connector name (`DP-4`) instead.
Each entry also has `enabled`, which is `false` while the monitor is paused.

The file is watched, so hand edits apply right away. An edit made within
200 ms of a change in the panel is overwritten by that change.

## Known limitations

- Omarchy's own popouts (clock, audio and others) assume the bar sits at the
  screen edge, so on a monitor with a reserved edge on the bar's side they
  open inside the black strip. This plugin's own panel opens beside the bar.
