import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "hance",
      editLink: {
        baseUrl: "https://github.com/Orva-Studio/hance/edit/main/packages/docs/",
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Orva-Studio/hance",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            { label: "Browser UI", slug: "getting-started/ui" },
            { label: "Free vs Pro", slug: "getting-started/free-vs-pro" },
            { label: "Hance vs Alternatives", slug: "getting-started/comparison" },
            { label: "AI Agent Usage", slug: "getting-started/agent" },
          ],
        },
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
  ],
});
