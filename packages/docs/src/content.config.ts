import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    author: z.string().default("Richard Oliver Bray"),
    // Header image: public path (e.g. "/blog/foo.png"). Also used as the
    // per-post OG/Twitter card. Kept a string (not an Astro asset) so a
    // not-yet-created file doesn't fail the build.
    heroImage: z.string(),
    heroAlt: z.string().default(""),
    // Feeds the Article JSON-LD `about` field; falls back to description.
    about: z.string().optional(),
    // Optional Q&As — when present, a FAQPage JSON-LD block is emitted.
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog,
};
