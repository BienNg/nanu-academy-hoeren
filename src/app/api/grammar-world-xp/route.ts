import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { worldAreas } from "@/data/grammar/world";
import { parseGrammarWorldRunInput } from "@/lib/grammar-world-runs";
import { GrammarWorldRunSchemaError, insertGrammarWorldRun } from "@/lib/grammar-world-runs-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { parseGrammarWorldXpInput } from "@/lib/xp";
import { syncQuestsQuietly } from "@/lib/quest-store";
import { QUEST_TIME_ZONE_HEADER, resolveQuestZone } from "@/lib/quests";
import { grantGrammarWorldXp, readTotalXp } from "@/lib/xp-store";

function knownTopic(topicId: string): boolean {
  return worldAreas.some((area) => area.topics.some((topic) => topic.id === topicId));
}

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

  const run = parseGrammarWorldXpInput(body);
  if (!run) {
    return NextResponse.json({ error: "Invalid grammar world part" }, { status: 400 });
  }

  const log = parseGrammarWorldRunInput(body);
  if (log && knownTopic(log.topicId)) {
    try {
      await insertGrammarWorldRun(session.user.id, log);
    } catch (error) {
      if (!(error instanceof GrammarWorldRunSchemaError)) {
        console.error("POST /api/grammar-world-xp log", error);
      }
    }
  }
  if (log?.outcome === "fail") {
    return NextResponse.json({ ok: true, xp: null, kind: null, ready: true, quests: null, total: null });
  }

  const grant = await grantGrammarWorldXp(session.user, run);
  const quests = await syncQuestsQuietly(
    session.user.id,
    resolveQuestZone(request.headers.get(QUEST_TIME_ZONE_HEADER)),
    { kind: "grammar", xp: grant.xp ?? 0 },
  );
  // Read after the quests are paid, so the total counts them too.
  const total = grant.ready ? await readTotalXp(session.user.id) : null;
  return NextResponse.json({
    ok: true,
    xp: grant.xp,
    kind: grant.kind,
    ready: grant.ready,
    quests,
    total,
  });
}
