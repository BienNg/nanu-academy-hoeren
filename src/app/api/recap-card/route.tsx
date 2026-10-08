import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import { classKey } from "@/lib/admin-overview";
import { getUserClassName, getUserDashboardFlags, resolveAccountAccess } from "@/lib/progress-store";
import { recapFileName, resolveRecapWeek } from "@/lib/weekly-recap";
import { loadWeeklyRecapCard } from "@/lib/weekly-recap-store";
import { CARD_HEIGHT, CARD_WIDTH, RecapCard, loadShareCardAssets, shareCardPhoto } from "./card";

export const dynamic = "force-dynamic";

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
    loadShareCardAssets(),
    shareCardPhoto(card.profile.image),
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
