# 8. Open the CPU's energy counter only through a visible terminal

- Status: Accepted
- Date: 2026-10-17 (`0b2c7b5`, `5060be2`)

## Context

The CPU's power draw comes from its RAPL energy counter, which the kernel
lets only root read (Platypus, CVE-2020-8694). Showing it needs a udev rule
and a `chmod`, which run as root. A plugin that runs root commands silently
from a button would be hard to trust.

## Decision

The panel's **CPU power** button, shown only where there is a counter, opens
a floating terminal running `cpu-power.sh enable` (or `disable`). The
script prints the exact root commands, asks, and runs them with `sudo`,
which asks for the password right there, or with `pkexec` where there is no
sudo. The commands are fixed and take no input. `disable` removes the rule
and makes the counter root's again. Nothing runs as root otherwise.

## Consequences

- Every root command is on screen before it runs, and the README lists them
  for doing it by hand.
- The rule lets every local user read the counter; on a single-user desktop
  that gives little away.
