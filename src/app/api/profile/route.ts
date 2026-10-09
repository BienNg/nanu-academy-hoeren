import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncBadges } from "@/lib/badge-store";
import { isProgressStoreConfigured, readLearnerName, renameLearner, resolveAccountAccess } from "@/lib/progress-store";
import { getUserXpTotals, getLeaderboard, getUserDailyXp } from "@/lib/xp-store";

function revokedResponse() {
  return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ ready: false });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const viewerId = session.user.id;
  const boardInput = {
    viewerId,
    viewerImage: session.user.image,
    scope: "class" as const,
    canPickClass: false,
  };

  const [storedName, totals, allTime, week, badges, daily] = await Promise.all([
    readLearnerName(viewerId),
    getUserXpTotals(viewerId),
    getLeaderboard({ ...boardInput, range: "all" }),
    getLeaderboard({ ...boardInput, range: "week" }),
    syncBadges(viewerId).catch((error: unknown) => {
      console.error("GET /api/profile badges", error);
      return null;
    }),
    getUserDailyXp(viewerId).catch((error: unknown) => {
      console.error("GET /api/profile daily xp", error);
      return null;
    }),
  ]);

  const className = allTime.className;
  const earned = badges?.board.families.filter((family) => family.tier > 0) ?? [];
  const podium = badges?.board.families.find((family) => family.id === "podium");

  return NextResponse.json({
    ready: true,
    name: storedName?.trim() ?? "",
    className,
    classXp: className ? allTime.rows.reduce((sum, row) => sum + row.xp, 0) : 0,
    classSize: className ? allTime.rows.length : 0,
    weekRank: week.className && week.yourRank ? week.yourRank : null,
    totalXp: totals.total,
    top3: podium?.value ?? 0,
    badges: earned,
    days: daily ?? [],
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ error: "Không lưu được tên lúc này." }, { status: 503 });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Tên không hợp lệ." }, { status: 400 });
  }

  const name = body && typeof body === "object" ? (body as { name?: unknown }).name : undefined;
  if (typeof name !== "string") {
    return NextResponse.json({ error: "Tên không hợp lệ." }, { status: 400 });
  }

  const result = await renameLearner(session.user.id, name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, name: result.name });
}
