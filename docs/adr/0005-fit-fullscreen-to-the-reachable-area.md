# 5. Fit fullscreen windows to the reachable area

- Status: Accepted
- Date: 2026-09-29 (`1a0b821`)

## Context

Fullscreen windows ignore exclusive zones, so on a monitor with a reserve a
video or game filled the whole monitor and the cap cropped it.

## Decision

When a window goes fullscreen on a monitor with a reserve, the service
switches it to Hyprland's fullscreen state `1 2`: maximized for Hyprland,
which keeps it inside the reserve, and still fullscreen for the app, the way
a browser's fullscreen fills only its window. Checks run on Hyprland's
fullscreen events and only while some monitor has a reserve.

## Consequences

- Videos and games get the reachable area's size; leaving fullscreen works
  as usual.
- Every fill goes black beside a fullscreen window, except the stats
  dashboard, which is most useful beside a game.
