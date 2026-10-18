# 4. Check UI in an offscreen harness, never on the live screens

- Status: Accepted
- Date: 2026-09-27

## Context

A screenshot of the user's monitors to check a fill also captured a browser
and a file dialog, and a test popout briefly took keyboard focus from the
user's typing.

## Decision

UI is checked with Qt's offscreen platform: a throwaway Quickshell config in
a scratch folder with `Commons` and `Ui` linked from Omarchy, a copy of the
plugin, and a `shell.qml` that draws one component and saves it with
`grabToImage`. Named monitors come from an offscreen `configfile`, and a
throwaway `HOME` with a demo `display-reserve.json` keeps the user's
settings out of it. Then the change is deployed and the user checks it by
hand.

## Consequences

- Renders are private and repeatable; the README images and the marketplace
  banner come from them.
- The offscreen platform uses the software renderer, where `MultiEffect`
  and other shaders draw nothing, which is one reason the logo fill
  recolors the SVG's text instead of masking it.
- `KeyboardPanel` needs a Wayland `PanelWindow`, so the harness swaps it for
  a `FloatingWindow` stand-in to draw the panel.
