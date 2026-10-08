import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { classKey } from "@/lib/admin-overview";
import { getUserClassName, getUserDashboardFlags, resolveAccountAccess } from "@/lib/progress-store";
import { recapFileName, resolveRecapWeek } from "@/lib/weekly-recap";
import { loadWeeklyRecapCard } from "@/lib/weekly-recap-store";
import { CARD_HEIGHT, CARD_WIDTH, RecapCard } from "./card";

export const dynamic = "force-dynamic";

const FONT_DIR = join(process.cwd(), "src/assets/fonts");

let assets: Promise<{
  fonts: { name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[];
  logoSrc: string;
}> | null = null;

function loadAssets() {
  assets ??= Promise.all([
    readFile(join(FONT_DIR, "BeVietnamPro-Medium.ttf")),
    readFile(join(FONT_DIR, "BeVietnamPro-Bold.ttf")),
    readFile(join(FONT_DIR, "BeVietnamPro-ExtraBold.ttf")),
    readFile(join(process.cwd(), "public/logo192.png"), "base64"),
  ]).then(([medium, bold, extraBold, logo]) => ({
    fonts: [
      { name: "Be Vietnam Pro", data: medium, weight: 500, style: "normal" },
      { name: "Be Vietnam Pro", data: bold, weight: 700, style: "normal" },
      { name: "Be Vietnam Pro", data: extraBold, weight: 800, style: "normal" },
    ],
    logoSrc: `data:image/png;base64,${logo}`,
  }));
  return assets;
}

/**
 * The Google photo as a data URI, larger than the stored 96px size. A slow or
 * failed fetch draws the initial instead of failing the whole card.
 */
async function profilePhoto(image: string | null): Promise<string | null> {
  if (!image) return null;
  const large = image.replace(/=s\d+(-c)?$/, "=s320-c");
  try {
    const response = await fetch(large, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${body.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * GET /api/recap-card?week=YYYY-MM-DD[&user=<id>]
 * Learners get their own card. Admins and staff may pass another user id.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const viewerId = session?.user?.id;
  if (!session?.user || !viewerId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if ((await resolveAccountAccess(viewerId, session.user.authAt)) === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }

  const params = request.nextUrl.searchParams;
  const targetId = params.get("user") || viewerId;
  if (targetId !== viewerId) {
    const flags = await getUserDashboardFlags(viewerId);
    const studentClass = classKey(await getUserClassName(targetId));
    const teachesTarget =
      flags.teacher &&
      studentClass.length > 0 &&
      flags.classes.some((name) => classKey(name) === studentClass);
    const canSeeOthers = isAdminUser(session.user) || flags.staff || teachesTarget;
    if (!canSeeOthers) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const week = resolveRecapWeek(params.get("week"));
  const card = await loadWeeklyRecapCard(targetId, week);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ fonts, logoSrc }, imageSrc] = await Promise.all([
    loadAssets(),
    profilePhoto(card.profile.image),
  ]);

  return new ImageResponse(<RecapCard card={card} logoSrc={logoSrc} imageSrc={imageSrc} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${recapFileName(week)}"`,
    },
  });
}
