# @hance/docs

Documentation site for the hance CLI, built with [Astro Starlight](https://starlight.astro.build/).

## Development

```sh
cd packages/docs
bun install      # from the repo root, or here
bun run dev      # local dev server with hot reload
bun run build    # production build into dist/
bun run preview  # serve the production build locally
```

## Configuration

Site-wide URLs live in one place: **`site.config.ts`**.

| Export      | Purpose                                                                        | Notes                                                                 |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `SITE_URL`  | Canonical site domain. Drives the sitemap and the per-page links in `llms.txt`. | Set this once a production domain exists. No trailing slash.          |
| `REPO_URL`  | GitHub repo base for "Edit page" links and the GitHub social icon.             | GitHub redirects `hance` → `hancer`, so the current value works as-is. |

After changing either value, run `bun run build` to confirm the output (links in `dist/llms.txt` should resolve from `SITE_URL`).

## Content

- Pages live in `src/content/docs/` as Markdown/MDX. Sidebar order is configured in `astro.config.mjs`.
- Theme and fonts are customized in `src/styles/custom.css` (dark-only; the `ThemeSelect` override forces dark mode).
- The `markdown-pages` integration (`src/integrations/markdown-pages.ts`) emits a plain-Markdown copy of each page and appends a page index to `llms.txt` for LLM consumption.
