import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt =
  "NaNu Go. Học và luyện tập tiếng Đức chuyên ngành. Từ NaNu NaNa - Du Hoc Duc.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const fontDir = join(process.cwd(), "src/assets/fonts");
  const [medium, extraBold, logo] = await Promise.all([
    readFile(join(fontDir, "BeVietnamPro-Medium.ttf")),
    readFile(join(fontDir, "BeVietnamPro-ExtraBold.ttf")),
    readFile(join(process.cwd(), "public/logo192.png"), "base64"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "linear-gradient(135deg, #003f88 0%, #0059b5 42%, #0071e3 100%)",
          color: "#ffffff",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 220,
            height: 220,
            borderRadius: 48,
            background: "#ffffff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${logo}`}
            width={180}
            height={180}
            alt=""
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 56,
            maxWidth: 760,
          }}
        >
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, opacity: 0.9 }}>
            NaNu NaNa - Du Hoc Duc
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              marginTop: 16,
            }}
          >
            NaNu Go
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              fontWeight: 500,
              lineHeight: 1.35,
              marginTop: 20,
            }}
          >
            Học và luyện tập tiếng Đức chuyên ngành
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Be Vietnam Pro", data: medium, weight: 500, style: "normal" },
        { name: "Be Vietnam Pro", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
