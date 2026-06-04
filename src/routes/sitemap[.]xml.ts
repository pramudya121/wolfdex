import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://wolfdex.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/swap", changefreq: "daily", priority: "0.9" },
          { path: "/pools", changefreq: "daily", priority: "0.9" },
          { path: "/liquidity", changefreq: "weekly", priority: "0.8" },
          { path: "/portfolio", changefreq: "weekly", priority: "0.7" },
          { path: "/analytics", changefreq: "daily", priority: "0.8" },
          { path: "/launchpad", changefreq: "weekly", priority: "0.8" },
          { path: "/farming", changefreq: "weekly", priority: "0.8" },
          { path: "/faucet", changefreq: "monthly", priority: "0.6" },
          { path: "/casino", changefreq: "weekly", priority: "0.7" },
          { path: "/docs", changefreq: "weekly", priority: "0.7" },
        ];

        // Add one entry per launched token (dynamic /token/$address route).
        try {
          const { data: tokens } = await supabase
            .from("launchpad_tokens")
            .select("address")
            .limit(1000);
          for (const t of tokens ?? []) {
            if (t?.address) {
              entries.push({ path: `/token/${t.address}`, changefreq: "weekly", priority: "0.5" });
            }
          }
        } catch (err) {
          console.warn("[sitemap] failed to load launchpad_tokens:", err);
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
