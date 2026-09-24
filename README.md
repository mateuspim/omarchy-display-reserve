# Display Reserve for Omarchy

An Omarchy shell service plugin that paints configured display edges black and
blocks pointer input there. It reads this live configuration file:

`~/.config/omarchy/display-reserve.json`

Use the accompanying project helper to write matching Hyprland reservations:

```bash
~/Projects/plugins/display-reserve/scripts/set-reserve DP-4 --top 480
```

Install this plugin locally with:

```bash
omarchy plugin add file:///home/pym/Projects/omarchy-display-reserve --enable --yes
```
