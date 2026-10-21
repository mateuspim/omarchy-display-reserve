# OmaReach brand assets

The mark is a monitor with its top and bottom edges reserved and the bar
in the reachable band between them: two solid strips (the lower one at
half opacity), two workspace dots and a short line for the bar's
modules, on a stand. At 32 px the frame, the two strips and the stand
stay readable; at 16 px it reduces to a framed screen with a bright top
strip. It is drawn as vector paths on a 24-unit grid, so the bar widget
(`ReserveIcon.qml`) can redraw it in the bar's own colours.

## Colours

Sampled from the shipped `preview.png` and `icon.svg`. The hero was made
in the Tsukiyo theme, and its values match that theme's palette.

| Use | Value | Theme name |
| --- | --- | --- |
| Accent: mark, "Reach", `$` prompt, terminal border | `#88a4ad` | `accent` |
| Mark's dots and bar line | `#9aa0a3` | |
| "Oma", tagline, chip and install text | `#d8d4cc` | `bright_foreground` |
| Subline | `#8a9196` | |
| Hero background | `#0a0e13` | `darker_background` |
| Chip fill | `#10161e` | |
| Install box and terminal fill | `#121820` | `background` |
| Chip and box outline | `#243039` | `selection` |
| Light logo: mark and "Reach" | `#4f6b75` | |
| Light logo: "Oma" | `#121820` | |
| Light logo: mark's dots and bar line | `#6a7175` | `dark_foreground` |

The accent is a calm slate blue; keep it for the mark and the "Reach"
half of the wordmark. In the bar and the panel the icon takes the bar's
and theme's colours instead of these.

## Assets

| Asset | Use |
| --- | --- |
| [`icon.svg`](../icon.svg) | Square app icon, README heading, marketplace. |
| [`logo.svg`](brand/logo.svg) | Horizontal wordmark on a dark surface. |
| [`logo-light.svg`](brand/logo-light.svg) | Horizontal wordmark on a light surface. |
| [`preview.svg`](brand/preview.svg) | Editable README hero layout. |
| [`captures/`](brand/captures/) | Offscreen renders the hero places: the stats fill and the panel, with made-up data. |
| [`preview.png`](../preview.png) | Rendered README hero at 3840 × 2160, also the marketplace image. |
| [`panel.png`](panel.png), [`stats.png`](stats.png) | Smaller README images: the panel and the stats fill. |

The logo SVGs and the preview inline the mark so they render standalone;
keep their paths in sync with `icon.svg` when changing it. Wordmarks and
hero text use live SVG text in JetBrainsMono Nerd Font (Omarchy's default
font), and the hero's chip icons are that font's glyphs, so the result
changes where the font is missing.

The current `preview.png` is rendered from `preview.svg`. It replaced an
earlier hero of the same layout whose source was not kept; the new one
matches it closely, without the earlier slight perspective on the two
UI renders.

## Rules

- Write the name **OmaReach**: one word, capital O and R. The plugin id
  stays `pym.omareach`.
- Keep clear space around the mark of at least a quarter of its height.
- Captures come from the offscreen harness with made-up data: never a
  desktop screenshot, a real host name, serial, path or address.

The [development runbook](runbooks/development.md#refresh-the-preview)
explains how to re-render the hero from fresh captures.
