import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { acceptUiClicks } from "@/lib/ui-clicks";
import { isProgressStoreConfigured, recordUiClicks, resolveAccountAccess } from "@/lib/progress-store";

/** Add a learner's buffered tab taps. An empty or fully rejected body is still success. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ saved: false, configured: false }, { status: 503 });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ saved: true });
  }

  const clicks = acceptUiClicks(body);
  if (clicks.length === 0) return NextResponse.json({ saved: true });

  const saved = await recordUiClicks(session.user.id, clicks);
  // "missing" means the table or columns are not the current schema. Dropping the
  // buffer here would erase the taps, so the client retries instead.
  if (saved !== "saved") {
    return NextResponse.json({ saved: false }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
