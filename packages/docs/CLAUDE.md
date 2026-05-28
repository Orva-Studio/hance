# @hance/docs

Astro Starlight documentation site. See `README.md` for setup/commands; this file is conventions and gotchas for editing.

## Structure
- Pages: `src/content/docs/**.md(x)`. A page's URL slug is its path under `docs/` (e.g. `docs/free-vs-pro.md` → `/free-vs-pro/`).
- Sidebar/nav is hand-maintained in `astro.config.mjs`. Every `slug:` there must match an existing content file's path, or the build fails with "slug … does not exist".

## When editing
- **Moving/renaming a page:** update its `slug` in `astro.config.mjs` AND any in-content links to it. After a move, the dev server may error on the old slug — clear the stale content cache with `rm -rf .astro` and rebuild.
- **URLs:** the site domain and GitHub repo live in `site.config.ts` (`SITE_URL`, `REPO_URL`). Never hardcode a domain in a page or config — these feed canonical URLs, the sitemap, and `llms.txt`.
- **Don't hand-edit `llms.txt` or the per-page `.md` files** — they're generated at build time by `starlight-llms-txt` + `src/integrations/markdown-pages.ts`. Edit the source `.md` pages instead.
- **Verify with `bun run build`** before committing; it surfaces broken slugs and links that dev mode can hide.

## Conventions
- Use Starlight asides (`:::note`, `:::tip`, `:::caution`) for callouts.
- Screenshot placeholders are `*<!-- Screenshot: ... -->*` lines.
- Pro-only features should link to the [Free vs Pro](src/content/docs/free-vs-pro.md) page.
