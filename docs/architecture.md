# Display Reserve architecture

Display Reserve is an Omarchy shell plugin: QML loaded into Omarchy's
Quickshell, plus two bash scripts. This page is how the parts fit together
today; the [decision records](adr/README.md) say why. The
[README](../README.md) is the user manual.

## Entry points

`manifest.json` names two entry points, both loaded by the shell:

| Kind | File | Does |
| --- | --- | --- |
| `service` | `Service.qml` | The layer surfaces for every reserved edge, fullscreen fitting, black when idle, the ruler and the IPC handler. `keepLoaded` keeps it up while plugins reload. |
| `barWidget` | `Panel.qml` | The bar icon and its popout panel. Any number of bar instances share one state. |

## Components and data flow

```
display-reserve.json ⇄ ReserveState (singleton) ──► Service ──► spacer + cap surfaces ──► ReserveFill
                              ▲      │                │                                     │
                     Panel ───┘      │                └─ fullscreen fitting (hyprctl, dispatch)
                     IPC  ───────────┘                                                      ▼
                                     └─► StatsSampler ◄── stats.sh, nvidia-smi        StatsFill ─► StatsCard
```

- **`ReserveState.qml`** (singleton) holds every monitor's settings,
  profiles and session settings, reads and writes
  `~/.config/omarchy/display-reserve.json`, and watches it for hand edits.
  It keeps `outputs` (what the user set) and `applied` (what is on screen),
  which trails it by up to 100 ms and holds during drags
  ([ADR 3](adr/0003-throttle-applied-state.md)). It also owns the shared
  helpers: the wallpaper link, the Omarchy logo, the stats sampler and the
  CPU power status.
- **`Model.js`** is the pure logic, without QML: normalizing entries,
  storage keys ([ADR 2](adr/0002-key-settings-by-monitor-description.md)),
  limits and budgets, aspect presets, profiles and automatic profiles, which
  edge a fill shows on, the clock and logo layouts, and fullscreen fitting.
  Node tests it.
- **`Service.qml`** makes two layer surfaces per reserved edge: a
  Bottom-layer spacer whose exclusive zone reserves the edge, and an
  Overlay-layer cap that draws the fill
  ([ADR 1](adr/0001-exclusive-zones-not-monitors-lua.md)). It fits fullscreen
  windows to the reachable area
  ([ADR 5](adr/0005-fit-fullscreen-to-the-reachable-area.md)), turns every
  edge black while idle, and answers `omarchy-shell pym.display-reserve …`.
- **`Panel.qml`** is the bar widget: a to-scale preview, fills, stats
  panels, edge sliders and fields, aspect presets, profiles, idle, ruler and
  undo, with keyboard shortcuts. Edits go to `ReserveState`.
- **`ReserveFill.qml`** draws one edge's fill (black, theme, wallpaper,
  dimmed, logo, clock or stats) for both the caps and the panel's preview.
  The logo recolors the SVG's text, and the clock is blocks from
  `Model.clockLayout`. Both move a few pixels every 5 minutes against burn-in.
- **`Ruler.qml`** is the calibration ruler, a click-through Overlay surface.

## The stats fill

- **`stats.sh`** prints a frame of `/proc` and `/sys` counters every second
  with bash builtins only, and a process list every third frame while the
  Processes panel is shown
  ([ADR 6](adr/0006-one-builtin-only-stats-sampler.md)).
- **`StatsSampler.qml`** (one instance, in `ReserveState`) runs `stats.sh`
  and, on NVIDIA, one `nvidia-smi -lms`, plus sysfs reads for AMD and Intel
  GPUs. It runs only while a monitor shows the stats fill or a panel
  previews it, pauses while idle, lets an idle dGPU rest
  ([ADR 7](adr/0007-let-an-idle-dgpu-rest.md)), and adds the shell's MPRIS
  players and UPower devices. Its clock ticks at the animation pace.
- **`Stats.js`** is the pure side: parsing frames, counters into rates,
  history, the theme's palette from `colors.toml`, how panels tile a strip
  (`Stats.fit`) and the rows each panel shows at a given size.
- **`StatsFill.qml`** lays out the grid; **`StatsCard.qml`** draws one
  panel; **`StatsGraph.qml`** the scrolling history graphs;
  **`StatsEase.qml`** eases meters between samples.
- **`cpu-power.sh`** reports whether the CPU's RAPL counter can be read and,
  from a visible terminal, opens or closes it as root
  ([ADR 8](adr/0008-cpu-power-through-a-visible-terminal.md)).

## Storage

| What | Where |
| --- | --- |
| Monitors, profiles, automatic profiles, idle, animation pace | `~/.config/omarchy/display-reserve.json` |
| The CPU power rule, only if you enable it | `/etc/udev/rules.d/70-rapl-energy.rules` |

Nothing else is written. The wallpaper is read through
`~/.local/state/omarchy/current/background`, and theme colors through
`qs.Commons` ([ADR 9](adr/0009-qualify-theme-color-for-qt-6-12.md)) and the
theme's `colors.toml`.

## Tests

`npm test` runs the Node tests in `tests/`: `model.test.js` (Model.js),
`stats.test.js` and `sampler.test.js` (Stats.js and stats.sh frames) and
`cpupower.test.js` (cpu-power.sh against a fake sysfs). GitHub Actions runs
the same on every push. UI is checked in an offscreen harness, never on the
live screens ([ADR 4](adr/0004-offscreen-render-harness.md)).
