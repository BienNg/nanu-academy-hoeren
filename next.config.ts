import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The recap card reads its fonts from disk at request time.
  outputFileTracingIncludes: {
    "/api/recap-card": ["./src/assets/fonts/*.ttf", "./public/logo192.png"],
  },
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
