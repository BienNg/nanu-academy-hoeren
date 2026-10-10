import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { deletePushSubscription, pushConfigured, pushPublicKey, savePushSubscription } from "@/lib/push-store";

function revokedResponse() {
  return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
}

function readSubscription(body: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = record.endpoint;
  const p256dh = record.keys?.p256dh;
  const authKey = record.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 2000) return null;
  if (typeof p256dh !== "string" || typeof authKey !== "string") return null;
  if (p256dh.length > 200 || authKey.length > 200) return null;
  return { endpoint, p256dh, auth: authKey };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ ready: false, publicKey: null });
  return NextResponse.json({ ready: true, publicKey: pushPublicKey() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured() || !isProgressStoreConfigured()) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }
  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const subscription = readSubscription(await request.json().catch(() => null));
  if (!subscription) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const saved = await savePushSubscription(session.user.id, subscription);
  if (saved === "missing") {
    return NextResponse.json({ error: "Run supabase/push_subscriptions.sql" }, { status: 503 });
  }
  if (saved === "failed") return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const removed = await deletePushSubscription(endpoint);
  if (removed === "failed") return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
