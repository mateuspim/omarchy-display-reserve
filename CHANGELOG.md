# Changelog

## 1.6.0 — 2026-10-18

### Added

- **Stats fill:** a live, btop-style system dashboard on one edge, in
  rounded boxes with history graphs and meters, in the theme's colors.
  Thirteen panels: GPU, iGPU, CPU, Memory, Network, Disks, Processes,
  Temperatures, Pressure, Fans, Battery, Now playing and a fastfetch-like
  System panel. GPU, CPU, Memory and Network are on by default; the panel's
  **Panels** grid (or `panels` / `panel` over IPC) picks the rest. Each card
  shows what fits its size, and the panels tile the edge in the grid that
  gives them the most room.
- **Battery panel:** a laptop's battery with the time left, plus UPower
  peripherals such as Bluetooth headsets and wireless mice.
- **CPU power draw** from the RAPL energy counter, with a meter against the
  CPU's power limit (Intel's PL1, or an AMD desktop's stock PPT). The kernel
  lets only root read the counter, so the **CPU power** button opens a
  terminal that prints the root commands, asks, and runs them with `sudo`
  (or `pkexec`); see [Security and privileges](README.md#security-and-privileges).
  IPC: `cpuPower status|enable|disable`.
- **Animation pace:** the dashboard's graphs and meters move at 30 fps by
  default; the **Animation** button (or `pace`) sets the display's rate,
  60, 30 or 15 fps, or none.

### Changed

- An idle discrete GPU that can power itself down is read less often, so
  the dashboard doesn't keep it awake. A sleeping GPU is never read.
- AMD GPUs are told discrete from integrated by their memory vendor.
- README: a marketplace banner, a Quick start, and **Remove** and
  **Security and privileges** sections. New `docs/architecture.md` and
  decision records in `docs/adr/`.

### Fixed

- **Qt 6.12:** QtQuick's own `Color` shadowed the theme singleton, so the
  theme fill, the logo, the clock and the ruler lost their theme colors.
  Theme colors are now read as `Commons.Color`.

## 1.5.0 — 2026-09-30

### Added

- **Automatic profiles:** **Auto** ties a profile to the monitors connected
  now, and it applies by itself whenever exactly those monitors connect
  again. A shell restart with the same monitors keeps your edits. IPC:
  `autoProfile`.
- **Dim amount:** the dimmed fill's darkness, 10% to 90%, per monitor (IPC
  `dim`).
- **A fill for every monitor:** right-click a fill (or a stats panel) to
  give it to every monitor.

### Fixed

- Of two profiles holding the same settings, the one last applied or saved
  stays selected.

## 1.4.0 — 2026-09-30

### Added

- **Profiles:** save every monitor as it is now under a name and apply it
  later with one click, `1` to `9`, or IPC (`profile`, `saveProfile`,
  `deleteProfile`, `profiles`). Applying or deleting one can be undone.

### Changed

- Less memory and work: the wallpaper fills decode at screen size without
  mipmaps, the spacer surface is one transparent pixel with an explicit
  exclusive zone, and the wallpaper is polled only for connected monitors.

## 1.3.0 — 2026-09-29

### Added

- **Black when idle:** every edge goes black after 30 s, 1 min or 5 min
  without input.
- **IPC** on the target `pym.display-reserve`, through `omarchy-shell`.
- **Aspect presets** (21:9, 16:9, 4:3, 1:1) that reserve the edges leaving a
  reachable area of that shape, at the top, center or bottom.
- **Calibration ruler** from every edge to the middle.
- The model tests run on GitHub Actions.

## 1.2.0 — 2026-09-29

### Added

- **Fullscreen fitting:** a fullscreen window on a monitor with a reserve is
  fitted to the reachable area (Hyprland's fullscreen state `1 2`).

### Changed

- The logo moves a few pixels every 5 minutes against burn-in, and every
  fill goes black under a fullscreen window.

## 1.1.0 — 2026-09-29

### Added

- **Fills** per monitor: Black (the default), Theme, Wallpaper, Dimmed and
  the Omarchy Logo.
- **Clock fill:** a 24-hour clock in big blocky digits on the largest edge,
  or the larger of top and bottom.

## 1.0.0 — 2026-09-29

The first release.

- Reserve any edge of any monitor in pixels, from a bar widget panel with a
  to-scale preview, sliders, pixel fields and keyboard shortcuts.
- The bar and tiled windows stay in the reachable area; black overlay strips
  cover the reserved edges and block the pointer.
- Settings are keyed by the monitor's description, so they follow it across
  connectors. Undo for Clear and zeroed edges.
