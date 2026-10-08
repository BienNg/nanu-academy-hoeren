import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { loadShareCardAssets, shareCardPhoto } from "@/app/api/recap-card/card";
import { leagueCardFileName, parseResultWeek } from "@/lib/admin-class-league";
import { requireDashboard } from "@/lib/auth-guard";
import { readAdminWeekResults } from "@/lib/class-quest-store";
import { CARD_HEIGHT, CARD_WIDTH, LeagueCard, classCardContent, leagueCardContent } from "./card";

export const dynamic = "force-dynamic";

/**
 * GET /admin/class-league/card?week=YYYY-MM-DD[&class=<classKey>]
 * The podium card of a finished week. With `class`, that class's top 3
 * learners for its group chat; without, the top 3 classes. Teachers only get
 * their own classes' cards.
 */
export async function GET(request: NextRequest) {
  const access = await requireDashboard();
  const params = request.nextUrl.searchParams;
  const now = new Date();
  const week = parseResultWeek(params.get("week"), now);
  const classKey = params.get("class");
  if (access.teacherClassKeys && (!classKey || !access.teacherClassKeys.has(classKey))) notFound();

  const results = await readAdminWeekResults(week, now);
  if (!results) return NextResponse.json({ error: "XP unreadable" }, { status: 503 });
  const row = classKey ? results.classes.find((entry) => entry.classKey === classKey) : null;
  if (classKey && !row) notFound();

  const [{ fonts, logoSrc }, photos] = await Promise.all([
    loadShareCardAssets(),
    Promise.all((row?.champions ?? []).map((place) => shareCardPhoto(place.image))),
  ]);
  const content = row ? classCardContent(results, row, photos) : leagueCardContent(results);

  return new ImageResponse(<LeagueCard content={content} logoSrc={logoSrc} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${leagueCardFileName(results.week, row?.name)}"`,
    },
  });
}
