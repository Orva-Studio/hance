# Skills

The Hance agent skill, shipped inside the CLI.

The skill content (`SKILL.md`, `subcommands/`, `references/`) is baked into the
`hance` binary at build time via `scripts/gen-skills.ts`. Agents read it at
runtime — no install or symlink needed:

```bash
hance skills              # the router / entry doc
hance skills list         # available subcommand + reference docs
hance skills get refine   # one doc
hance skills path         # extract docs to a local dir
```

When this repo is opened in Claude Code, the skill at `skills/` is also
auto-loaded for local development.
