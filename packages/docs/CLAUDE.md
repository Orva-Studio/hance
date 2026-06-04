# @hance/docs

Unified Astro site: a Tailwind marketing landing page at `/` plus the Starlight docs under `/docs/*`. See `README.md` for setup/commands; this file is conventions and gotchas for editing.

## Structure
- Marketing landing: `src/pages/index.astro` + `src/layouts/Base.astro` + `src/styles/global.css` (Tailwind v4 via `@tailwindcss/vite`; legacy tokens bridged through `tailwind.config.mjs` with the `@config` directive in `global.css`). This explicit root page overrides Starlight's own index. Its styles only load on pages using `Base.astro`, so they don't bleed into Starlight.
- Docs pages: `src/content/docs/docs/**.md(x)`. Content is nested one level under `docs/` so URLs are prefixed: `src/content/docs/docs/free-vs-pro.md` → `/docs/free-vs-pro/`.
- Sidebar/nav is hand-maintained in `astro.config.mjs`. Every `slug:` there is `docs/…` and must match an existing content file's path, or the build fails with "slug … does not exist".

## When editing
- **Moving/renaming a page:** update its `slug` in `astro.config.mjs` AND any in-content links to it. After a move, the dev server may error on the old slug — clear the stale content cache with `rm -rf .astro` and rebuild.
- **URLs:** the site domain and GitHub repo live in `site.config.ts` (`SITE_URL`, `REPO_URL`). Never hardcode a domain in a page or config — these feed canonical URLs, the sitemap, and `llms.txt`.
- **Don't hand-edit `llms.txt` or the per-page `.md` files** — they're generated at build time by `starlight-llms-txt` + `src/integrations/markdown-pages.ts`. Edit the source `.md` pages instead.
- **Verify with `bun run build`** before committing; it surfaces broken slugs and links that dev mode can hide.

## Conventions
- **NEVER use em dashes (`—`) in docs content.** Rewrite as separate sentences, a comma, a colon, or parentheses. This applies to all `.md(x)` pages and page copy.
- Use Starlight asides (`:::note`, `:::tip`, `:::caution`) for callouts.
- Screenshot placeholders are `*<!-- Screenshot: ... -->*` lines.
- Pro-only features should link to the [Free vs Pro](src/content/docs/free-vs-pro.md) page.
