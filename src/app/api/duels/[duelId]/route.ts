import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { actOnDuel } from "@/lib/duel-store";
import { isDuelId } from "@/lib/duels";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

function revokedResponse() {
  return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ duelId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const { duelId } = await context.params;
  if (!isDuelId(duelId)) {
    return NextResponse.json({ error: "Invalid duel" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = record.action;
  const pageSession = typeof record.pageSession === "string" ? record.pageSession : "";
  const text = typeof record.text === "string" ? record.text : "";
  const position = typeof record.position === "number" ? record.position : null;
  const elapsedMs = typeof record.elapsedMs === "number" ? record.elapsedMs : null;
  if (action !== "open" && action !== "begin" && action !== "settle" && action !== "forfeit") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await actOnDuel({
    userId: session.user.id,
    duelId,
    action,
    pageSession,
    text,
    position,
    elapsedMs,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, view: result.view, feedback: result.feedback });
}
