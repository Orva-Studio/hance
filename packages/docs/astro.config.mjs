import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import starlightLlmsTxt from "starlight-llms-txt";
import markdownPages from "./src/integrations/markdown-pages";
import { SITE_URL, REPO_URL } from "./site.config";

export default defineConfig({
  site: SITE_URL,
  redirects: {
    // Docs have no landing of their own — default to the introduction.
    "/docs": "/docs/getting-started/introduction/",
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      plugins: [
        starlightLlmsTxt({
          description:
            "hance applies cinematic film looks to video and images, rendered in one command with no plugins or LUTs.",
          details: [
            "hance is a single-binary CLI (run via `npx @orva-studio/hance`) that bakes a film look",
            "into a new file in one FFmpeg pass. Preview looks in a browser editor, render at export",
            "quality, then import the graded clip into any editor (CapCut, iMovie, ScreenFlow). It can",
            "also be driven from AI coding agents like Claude Code or Cursor via its skill commands.",
          ].join(" "),
        }),
      ],
      title: "hance",
      components: {
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      editLink: {
        baseUrl: `${REPO_URL}/edit/main/packages/docs/`,
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: REPO_URL,
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "docs/getting-started/introduction" },
            { label: "Hance vs Alternatives", slug: "docs/getting-started/comparison" },
            { label: "Installation", slug: "docs/getting-started/installation" },
            { label: "Quick Start", slug: "docs/getting-started/quick-start" },
          ],
        },
        {
          label: "AI Agent",
          items: [
            { label: "Overview", slug: "docs/agent/overview" },
            { label: "Skill Commands", slug: "docs/agent/commands" },
          ],
        },
        { label: "Browser UI", slug: "docs/browser-ui" },
        { label: "Free vs Pro", slug: "docs/free-vs-pro" },
        {
          label: "CLI Reference",
          items: [
            { label: "Commands", slug: "docs/cli/commands" },
            { label: "Effects", slug: "docs/cli/effects" },
            { label: "Export Presets", slug: "docs/cli/export-presets" },
            { label: "Output Quality", slug: "docs/cli/output-quality" },
            { label: "Config File", slug: "docs/cli/config-file" },
          ],
        },
        {
          label: "Looks",
          items: [
            { label: "Default Look", slug: "docs/looks/default" },
            { label: "Built-in Looks", slug: "docs/looks/built-in" },
            { label: "Custom Looks", slug: "docs/looks/custom" },
          ],
        },
        {
          label: "Recipes",
          items: [
            { label: "Animation Pipelines", slug: "docs/recipes/animation-pipelines" },
          ],
        },
        { label: "Architecture", slug: "docs/architecture" },
      ],
    }),
    markdownPages(),
  ],
});
