# 6. One stats sampler in shell builtins, for every monitor

- Status: Accepted
- Date: 2026-10-14 (`ae0b40a`)

## Context

A btop-style dashboard needs a frame of counters every second. Starting
`cat`, `sensors` or similar per value would cost dozens of processes a
second, and one sampler per monitor or panel preview would multiply that.

## Decision

`stats.sh` prints a frame of `/proc` and `/sys` counters every second using
bash builtins only, so a frame starts no process. One long-running
`nvidia-smi -lms` covers an NVIDIA GPU. One `StatsSampler` in `ReserveState`
serves every monitor and preview; it runs only while some monitor shows the
stats fill or a panel previews it, and stops while the session is idle.
Parsing, rates and layout live in `Stats.js`, pure JavaScript that Node
tests without QML.

## Consequences

- An idle dashboard costs one bash loop and, on NVIDIA, one `nvidia-smi`.
- Process lists cost a pass over `/proc`, so they come every 3 seconds and
  only while the Processes panel is shown.
- Reading a GPU keeps it awake, which led to
  [ADR 7](0007-let-an-idle-dgpu-rest.md).
