import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push"],
  // The share cards read their fonts from disk at request time.
  outputFileTracingIncludes: {
    "/api/recap-card": ["./src/assets/fonts/*.ttf"],
    "/admin/class-league/card": ["./src/assets/fonts/*.ttf"],
    "/opengraph-image": ["./src/assets/fonts/*.ttf"],
    "/icon": ["./src/assets/fonts/Fredoka-Bold.ttf"],
    "/icon1": ["./src/assets/fonts/Fredoka-Bold.ttf"],
    "/icon2": ["./src/assets/fonts/Fredoka-Bold.ttf"],
    "/apple-icon": ["./src/assets/fonts/Fredoka-Bold.ttf"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  // Replaces the built-in list, so the original crawlers stay and Zalo is added.
  // Zalo's preview fetch is not in Next's default set, and it reads tags from <head>.
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Zalo|TelegramBot|Viber/i,
  outputFileTracingExcludes: {
    "/*": [
      // Served from the CDN; server code checks src/data/media-files.json instead.
      "./public/audio/**",
      "./public/images/**",
      // next/og loads sharp only if present, else draws PNGs with its bundled
      // resvg. Shipped, sharp's binaries add ~25 MB to every API function.
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
