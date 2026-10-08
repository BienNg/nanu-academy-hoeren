import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { Wordmark } from "@/components/Logo";

export const alt =
  "NaNu Go. Học và luyện tập tiếng Đức chuyên ngành. Từ NaNu NaNa - Du Hoc Duc.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const fontDir = join(process.cwd(), "src/assets/fonts");
  const [medium, extraBold, fredoka] = await Promise.all([
    readFile(join(fontDir, "BeVietnamPro-Medium.ttf")),
    readFile(join(fontDir, "BeVietnamPro-ExtraBold.ttf")),
    readFile(join(fontDir, "Fredoka-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #003f88 0%, #0059b5 42%, #0071e3 100%)",
          color: "#ffffff",
          padding: "72px 88px",
          fontFamily: "Be Vietnam Pro",
        }}
      >
        <Wordmark size={108} tone="onBlue" fontFamily="Fredoka" />
        <div style={{ display: "flex", fontSize: 28, fontWeight: 500, opacity: 0.9, marginTop: 28 }}>
          NaNu NaNa - Du Hoc Duc
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            fontWeight: 500,
            lineHeight: 1.35,
            marginTop: 16,
          }}
        >
          Học và luyện tập tiếng Đức chuyên ngành
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Be Vietnam Pro", data: medium, weight: 500, style: "normal" },
        { name: "Be Vietnam Pro", data: extraBold, weight: 800, style: "normal" },
        { name: "Fredoka", data: fredoka, weight: 700, style: "normal" },
      ],
    },
  );
}
