import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncQuests } from "@/lib/quest-store";
import { QUEST_TIME_ZONE_HEADER, resolveQuestZone } from "@/lib/quests";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ ready: false, quests: [] });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  try {
    const { board, update } = await syncQuests(
      session.user.id,
      resolveQuestZone(request.headers.get(QUEST_TIME_ZONE_HEADER)),
    );
    return NextResponse.json({ ...board, update });
  } catch (error) {
    console.error("GET /api/quests", error);
    return NextResponse.json({ ready: false, quests: [] });
  }
}
