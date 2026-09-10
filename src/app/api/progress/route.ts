import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { normalizeProgress, type StoredProgress } from "@/lib/progress";
import {
  getCloudProgress,
  isProgressStoreConfigured,
  resolveAccountAccess,
  setCloudProgress,
  touchUserProfile,
} from "@/lib/progress-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

function sessionProfile(session: { user: { email?: string | null; name?: string | null } }) {
  return { email: session.user.email, name: session.user.name };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json(
      {
        progress: null,
        configured: false,
        message: "Cloud progress store is not configured",
      },
      { status: 200 },
    );
  }

  const access = await resolveAccountAccess(
    session.user.id,
    session.user.authAt,
  );
  if (access === "revoked") return revokedResponse();

  const progress = await getCloudProgress(session.user.id);
  await touchUserProfile(session.user.id, sessionProfile(session));
  return NextResponse.json({ progress, configured: true });
}

export async function PUT(request: Request) {
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

  const access = await resolveAccountAccess(
    session.user.id,
    session.user.authAt,
  );
  if (access === "revoked") return revokedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const progress = normalizeProgress(body as Partial<StoredProgress>);
  await setCloudProgress(session.user.id, progress, sessionProfile(session));
  return NextResponse.json({ progress, ok: true });
}
