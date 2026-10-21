# Contributing to OmaReach

Thanks for helping. OmaReach is a small project; issues and focused pull
requests are welcome.

## Before you start

- Bugs and ideas: open an issue first for anything larger than a small fix.
- Security problems: follow [SECURITY.md](SECURITY.md), not a public issue.
- Read [AGENTS.md](AGENTS.md): it holds the code rules for people and coding
  agents alike, and [docs/architecture.md](docs/architecture.md).

## Set up

The installed plugin is a git checkout of this repository:

```bash
omarchy plugin add https://github.com/mateuspim/omareach.git --enable --yes
cd ~/.config/omarchy/plugins/pym.omareach
git switch -c my-change
```

Edit there and run `omarchy restart shell` to load your change. Tests need
Node 22. The [development runbook](docs/runbooks/development.md) has the
details.

## Make a change

1. Branch from `master`.
2. Keep the change focused; update the guide in
   [docs/guide](docs/guide/), the
   [spec](docs/specs/) or doc it affects.
3. Add or update tests. Run `npm test` and `omarchy plugin validate .`.
4. For UI changes, attach an offscreen render (see the
   [development runbook](docs/runbooks/development.md#render-ui-offscreen)),
   never a desktop screenshot with personal data.
5. Durable design choice? Add an ADR under [docs/adr](docs/adr/README.md).

## Commit style

Plain imperative subject ("Add …", "Keep …"), under ~72 characters, and a
body that explains why.

## Pull request checklist

- [ ] Tests pass and `omarchy plugin validate .` exits 0
- [ ] Docs and CHANGELOG (Unreleased) updated
- [ ] No personal paths, device names, serials or addresses in tracked files

## License

By contributing you agree your work is released under the [MIT License](LICENSE).
