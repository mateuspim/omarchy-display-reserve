# How it works

How OmaReach reserves an edge, fits fullscreen windows, draws the
wallpaper and stores its settings, and what it can't do.

Each reserved edge gets two layer-shell surfaces:

| Surface | Layer | Purpose |
| --- | --- | --- |
| `pym-omareach-spacer` | Bottom | Reserves the edge with an exclusive zone. Hyprland lays out exclusive zones from the lowest layer up, so this claims the edge before the Top-layer bar, which lands just inside the reachable area with tiled windows after it. |
| `pym-omareach` | Overlay | A strip in the monitor's fill that blocks the pointer and covers anything that strays into the reserved area. |

While the ruler is up, a click-through `pym-omareach-ruler` surface
covers its monitor on the Overlay layer.

Fullscreen windows ignore exclusive zones, so on a monitor with a reserve
the plugin fits them to the reachable area instead: when a window goes
fullscreen there, it switches it to Hyprland's fullscreen state `1 2`,
maximized for Hyprland (which keeps it inside the reserve) and still
fullscreen for the app, the way a browser's fullscreen fills only its
window. Leaving fullscreen works as usual (`Super+F`, Esc, the app's own
button). A game in fullscreen gets the reachable area's size too.

The wallpaper and dimmed fills draw the image that
`~/.local/state/omarchy/current/background` points to, scaled and cropped
the way Omarchy's background layer does it. While any monitor uses one of
them, the link is checked every 2 seconds, so after a wallpaper or theme
change the edges can show the old image for up to 2 seconds.

The plugin never edits `~/.config/hypr/monitors.lua` or runs
`hyprctl reload`.

## Saved settings

Reservations are stored in `~/.config/omarchy/omareach.json`, keyed
by the monitor's Hyprland description (make, model and serial, as in
`hyprctl monitors`), so they follow the monitor when a dock renumbers its
connectors:

```json
{ "outputs": { "Dell Inc. DELL U2720Q 1A2B3C4": { "enabled": true, "top": 350, "bottom": 0, "left": 0, "right": 0 } } }
```

A monitor with no description, or one that shares its description with
another connected monitor, is keyed by its connector name (`DP-4`) instead.
Each entry also has `enabled`, which is `false` while the monitor is paused,
and can have `fill`: `"black"` (the default), `"theme"`, `"wallpaper"`,
`"dim"`, `"logo"`, `"clock"` or `"stats"`, `clockEdge`: `"largest"` (the
default) or `"topBottom"`, `dim`: the dimmed fill's percent (60 by
default), and `panels`: the stats panels, `["gpu", "cpu", "memory",
"network"]` by default.
Clear keeps the fill. Black when idle is one setting for every monitor,
stored beside `outputs` as `"idleBlack"`: seconds, left out while it is
off. The dashboard's animation pace is one setting too, `"statsPace"`:
frames a second, left out at the default 30. Profiles are stored beside them as `"profiles"`, each a copy of
`outputs` under its name; applying one makes `outputs` exactly that copy.
`"autoProfiles"` maps a profile's name to the monitor keys it applies with,
and `"monitors"` holds the keys connected last, so the plugin can tell a
new set of monitors from a restart.

The file is watched, so hand edits apply right away. An edit made within
200 ms of a change in the panel is overwritten by that change.

The [settings spec](../specs/settings.md) is the full contract for this file.

## Known limitations

- Omarchy's own popouts (clock, audio and others) assume the bar sits at the
  screen edge, so on a monitor with a reserved edge on the bar's side they
  open inside the black strip. This plugin's own panel opens beside the bar.
