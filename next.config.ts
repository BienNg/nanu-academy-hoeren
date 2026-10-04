import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The recap card reads its fonts from disk at request time.
  outputFileTracingIncludes: {
    "/api/recap-card": ["./src/assets/fonts/*.ttf", "./public/logo192.png"],
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
