# 2. Key saved settings by the monitor's description

- Status: Accepted
- Date: 2026-09-27 (`18281ed`)

## Context

Connector names (`DP-4`) are not stable: a dock or a different port
renumbers them, and a reserve meant for a tall rotated monitor would land on
whatever monitor took its connector.

## Decision

Entries in `~/.config/omarchy/display-reserve.json` are keyed by the
monitor's Hyprland description (make, model and serial). A monitor with no
description, or one that shares its description with another connected
monitor, falls back to its connector name. Callers (the panel, IPC) still
name monitors by connector; `Model.outputKeys` maps between the two.
Entries saved under a connector name are read and move to the new key on the
next edit.

## Consequences

- Reserves follow the monitor across docks and ports.
- Two identical monitors without serials share a key, so each falls back to
  its connector.
- Profiles and automatic profiles reuse the same keys to recognise a set of
  monitors.
