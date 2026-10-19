# 10. Rename Display Reserve to OmaReach with a new plugin ID

- Status: Accepted
- Date: 2026-10-19

## Context

"Display Reserve" said what the plugin does but was hard to remember, and the
owner's other plugin is OmaDroid. The owner wanted one consistent name
everywhere: the bar, the docs, the repository and the plugin ID. The plugin
was already listed on the Omarchy marketplace as `pym.display-reserve`, and
marketplace IDs are permanent: an ID can't be renamed or reused.

## Decision

The plugin becomes **OmaReach**, after the tagline "Use only the screen you
can reach", with a fresh ID and no data migration, as OmaDroid's rename did:

- plugin ID and IPC target `pym.omareach`, layer namespaces `pym-omareach*`,
  settings `~/.config/omarchy/omareach.json`, log prefix `omareach:`;
- the GitHub repository `mateuspim/omarchy-display-reserve` is renamed to
  `mateuspim/omareach` (GitHub redirects the old URL);
- OmaReach is submitted to the marketplace as a new listing, and the old
  `pym.display-reserve` listing is retired.

The code reads only the new settings file. The README's "Coming from Display
Reserve" section gives the manual steps: remove the old plugin, move the
settings file, add the new one, and update keybinds to the new IPC target.

## Consequences

- One name everywhere; `display-reserve` appears only in CHANGELOG history,
  this record and the migration note.
- Existing users move over by hand once; without it they keep the old plugin
  and lose nothing, but get no updates.
- The CPU power udev rule (`70-rapl-energy.rules`) never carried the plugin's
  name, so it carries over untouched.
