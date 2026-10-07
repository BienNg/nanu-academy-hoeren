import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The recap card reads its fonts from disk at request time.
  outputFileTracingIncludes: {
    "/api/recap-card": ["./src/assets/fonts/*.ttf", "./public/logo192.png"],
  },
  // Served from the CDN; server code checks src/data/media-files.json instead.
  outputFileTracingExcludes: {
    "/*": ["./public/audio/**", "./public/images/**"],
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
