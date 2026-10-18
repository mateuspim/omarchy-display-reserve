# Architecture Decision Records

Each record describes one decision in Display Reserve's design: the context
that led to it, what was decided, and what follows from it. They use Michael
Nygard's format (Title, Status, Context, Decision, Consequences) and are
numbered in the order the decisions were made. Dates and commit ids come
from the git history. For how the parts fit together today, see the
[architecture overview](../architecture.md).

| # | Decision | Date | Status |
| --- | --- | --- | --- |
| [1](0001-exclusive-zones-not-monitors-lua.md) | Reserve edges with layer-shell exclusive zones, not monitors.lua | 2026-09-27 | Accepted |
| [2](0002-key-settings-by-monitor-description.md) | Key saved settings by the monitor's description | 2026-09-27 | Accepted |
| [3](0003-throttle-applied-state.md) | Throttle what is applied, and hold it during drags | 2026-09-27 | Accepted |
| [4](0004-offscreen-render-harness.md) | Check UI in an offscreen harness, never on the live screens | 2026-09-27 | Accepted |
| [5](0005-fit-fullscreen-to-the-reachable-area.md) | Fit fullscreen windows to the reachable area | 2026-09-29 | Accepted |
| [6](0006-one-builtin-only-stats-sampler.md) | One stats sampler in shell builtins, for every monitor | 2026-10-14 | Accepted |
| [7](0007-let-an-idle-dgpu-rest.md) | Let an idle discrete GPU rest | 2026-10-15 | Accepted |
| [8](0008-cpu-power-through-a-visible-terminal.md) | Open the CPU's energy counter only through a visible terminal | 2026-10-17 | Accepted |
| [9](0009-qualify-theme-color-for-qt-6-12.md) | Qualify the theme `Color` as `Commons.Color` (Qt 6.12) | 2026-10-18 | Accepted |
