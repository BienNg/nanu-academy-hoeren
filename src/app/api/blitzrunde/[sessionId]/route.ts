import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBlitzrundeId } from "@/lib/blitzrunde";
import {
  getStudentRound,
  joinSession,
  recordHeartbeat,
  submitResult,
  type StoreError,
} from "@/lib/blitzrunde-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

const STATUS: Record<StoreError, number> = {
  unavailable: 503,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 400,
};

type Context = { params: Promise<{ sessionId: string }> };

async function viewer(context: Context): Promise<{ userId: string; sessionId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isProgressStoreConfigured()) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }
  const { sessionId } = await context.params;
  if (!isBlitzrundeId(sessionId)) return NextResponse.json({ error: "Invalid round" }, { status: 400 });
  return { userId: session.user.id, sessionId };
}

function failed(result: { error: StoreError; message?: string }) {
  return NextResponse.json({ error: result.error, message: result.message }, { status: STATUS[result.error] });
}

export async function GET(_request: Request, context: Context) {
  const who = await viewer(context);
  if (who instanceof NextResponse) return who;
  const result = await getStudentRound(who.sessionId, who.userId);
  if (!result.ok) return failed(result);
  return NextResponse.json(
    { round: result.value, serverNow: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: Context) {
  const who = await viewer(context);
  if (who instanceof NextResponse) return who;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body && typeof body === "object" ? (body as Record<string, unknown>).action : null;

  if (action === "join") {
    const result = await joinSession(who.sessionId, who.userId);
    return result.ok ? NextResponse.json({ ok: true }) : failed(result);
  }
  if (action === "heartbeat") {
    const result = await recordHeartbeat(who.sessionId, who.userId, body);
    return result.ok
      ? NextResponse.json({ ok: true, ...result.value, serverNow: new Date().toISOString() })
      : failed(result);
  }
  if (action === "submit") {
    const result = await submitResult(who.sessionId, who.userId, body);
    return result.ok ? NextResponse.json({ ok: true, ...result.value }) : failed(result);
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
