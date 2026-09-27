import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { emptyLeaderboard, type LeaderboardBoard, type LeaderboardRange, type LeaderboardScope } from "@/lib/xp";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { getDuelLeaderboard, getLeaderboard } from "@/lib/xp-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

function readScope(value: string | null): LeaderboardScope {
  return value === "global" ? "global" : "class";
}

function readRange(value: string | null): LeaderboardRange {
  return value === "all" ? "all" : "week";
}

function readBoard(value: string | null): LeaderboardBoard {
  return value === "duel" ? "duel" : "xp";
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = readScope(url.searchParams.get("scope"));
  const range = readRange(url.searchParams.get("range"));
  const board = readBoard(url.searchParams.get("board"));
  const now = new Date();

  if (!isProgressStoreConfigured()) {
    return NextResponse.json(emptyLeaderboard({ scope, range, now, ready: false, board }));
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const boardInput = {
    viewerId: session.user.id,
    scope,
    range,
    now,
  };
  const payload =
    board === "duel" ? await getDuelLeaderboard(boardInput) : await getLeaderboard(boardInput);
  return NextResponse.json(payload);
}
