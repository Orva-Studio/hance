import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import markdownPages from "./src/integrations/markdown-pages";
import { SITE_URL, REPO_URL } from "./site.config";

export default defineConfig({
  site: SITE_URL,
  integrations: [
    starlight({
      plugins: [starlightLlmsTxt()],
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
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Hance vs Alternatives", slug: "getting-started/comparison" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
          ],
        },
        {
          label: "AI Agent",
          items: [
            { label: "Overview", slug: "agent/overview" },
            { label: "Skill Commands", slug: "agent/commands" },
          ],
        },
        { label: "Browser UI", slug: "browser-ui" },
        { label: "Free vs Pro", slug: "free-vs-pro" },
        {
          label: "CLI Reference",
          items: [
            { label: "Commands", slug: "cli/commands" },
            { label: "Effects", slug: "cli/effects" },
            { label: "Export Presets", slug: "cli/export-presets" },
            { label: "Output Quality", slug: "cli/output-quality" },
            { label: "Config File", slug: "cli/config-file" },
          ],
        },
        {
          label: "Looks",
          items: [
            { label: "Default Look", slug: "looks/default" },
            { label: "Built-in Looks", slug: "looks/built-in" },
            { label: "Custom Looks", slug: "looks/custom" },
          ],
        },
        { label: "Architecture", slug: "architecture" },
      ],
    }),
    markdownPages(),
  ],
});
