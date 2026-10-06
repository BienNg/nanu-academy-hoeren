import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseLessonJumpInput } from "@/lib/lesson-jump";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { syncQuestsQuietly } from "@/lib/quest-store";
import { QUEST_TIME_ZONE_HEADER, resolveQuestZone } from "@/lib/quests";
import { grantLessonJumpXp } from "@/lib/xp-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json(
      { error: "Cloud progress store is not configured" },
      { status: 503 },
    );
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jump = parseLessonJumpInput(body);
  if (!jump) {
    return NextResponse.json({ error: "Invalid jump test" }, { status: 400 });
  }

  const grant = await grantLessonJumpXp(session.user.id, jump);
  const quests = await syncQuestsQuietly(
    session.user.id,
    resolveQuestZone(request.headers.get(QUEST_TIME_ZONE_HEADER)),
    { kind: "jump", xp: grant.xp ?? 0 },
  );
  return NextResponse.json({ ok: true, xp: grant.xp, kind: grant.kind, ready: grant.ready, quests });
}
