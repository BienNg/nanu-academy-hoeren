import type { MetadataRoute } from "next";
import { colors } from "@/lib/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NaNu Go",
    short_name: "NaNu Go",
    description: "Học và luyện tập tiếng Đức chuyên ngành. Từ NaNu NaNa - Du Hoc Duc.",
    lang: "vi",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#129BE0",
    theme_color: colors.surface,
    categories: ["education"],
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon1", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
