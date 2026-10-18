# 7. Let an idle discrete GPU rest

- Status: Accepted
- Date: 2026-10-15 (`4ae369a`)

## Context

Reading a discrete GPU's sensors wakes it from runtime power management, so
a dashboard reading a laptop's dGPU every second would keep it powered and
drain the battery.

## Decision

A GPU the kernel has put to sleep is shown as asleep and never read. An
awake GPU that can power itself down and has shown no load for 5 seconds
rests: `nvidia-smi` stops (and `stats.sh` gets `STATS_NVIDIA=0`), an AMD
card is read every 10 seconds instead of every second, and the panel shows
its last reading as idle until a reading finds it busy again.

## Consequences

- The dashboard doesn't keep a laptop's dGPU awake.
- A resting GPU's numbers can be up to 10 seconds old.
