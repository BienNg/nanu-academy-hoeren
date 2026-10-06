import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markBadgesSeen, syncBadges } from "@/lib/badge-store";
import { parseBadgeId } from "@/lib/badges";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

/**
 * The learner's badge collection. Also stores badges they just reached.
 * `?unseen=1` returns only the unlocks not shown yet, for the nav popup.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ ready: false, families: [], fresh: [] });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  try {
    const { board } = await syncBadges(session.user.id);
    if (new URL(request.url).searchParams.get("unseen") === "1") {
      return NextResponse.json({ ready: board.ready, fresh: board.fresh });
    }
    return NextResponse.json(board);
  } catch (error) {
    console.error("GET /api/badges", error);
    return NextResponse.json({ ready: false, families: [], fresh: [] });
  }
}

/** `{ seen: string[] }` marks those unlocks as shown. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) return NextResponse.json({ ok: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const seen = (body as { seen?: unknown } | null)?.seen;
  if (!Array.isArray(seen)) {
    return NextResponse.json({ error: "Invalid badges" }, { status: 400 });
  }
  const ids = seen
    .filter((id): id is string => typeof id === "string" && parseBadgeId(id) != null)
    .slice(0, 100);
  await markBadgesSeen(session.user.id, ids);
  return NextResponse.json({ ok: true });
}
