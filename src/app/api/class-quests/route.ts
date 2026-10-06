import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimClassQuest, getClassQuestBoard } from "@/lib/class-quest-store";
import { classQuestById } from "@/lib/class-quests";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

const NOT_READY = { ready: false, hasClass: false, daily: [], weekly: [] };

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

/** Today's and this week's quests for the learner's class. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) return NextResponse.json(NOT_READY);

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  try {
    return NextResponse.json(await getClassQuestBoard(session.user.id, session.user.image));
  } catch (error) {
    console.error("GET /api/class-quests", error);
    return NextResponse.json(NOT_READY);
  }
}

/** `{ questId }` claims a finished class quest the learner helped with. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) return NextResponse.json(NOT_READY, { status: 503 });

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const questId = (body as { questId?: unknown } | null)?.questId;
  if (typeof questId !== "string" || !classQuestById(questId)) {
    return NextResponse.json({ error: "Invalid quest" }, { status: 400 });
  }

  try {
    const result = await claimClassQuest(session.user.id, session.user.image, questId);
    return NextResponse.json(
      { ...result.board, claimedXp: result.xp, denial: result.denial },
      { status: result.denial && result.denial !== "claimed" ? 409 : 200 },
    );
  } catch (error) {
    console.error("POST /api/class-quests", error);
    return NextResponse.json(NOT_READY, { status: 500 });
  }
}
