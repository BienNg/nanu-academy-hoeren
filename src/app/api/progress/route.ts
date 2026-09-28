import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { absorbAddedLessonClips, normalizeProgress, type StoredProgress } from "@/lib/progress";
import { listLessonClipCatalog } from "@/lib/levels";
import { syncStudiedClips } from "@/lib/duel-store";
import {
  getCloudProgress,
  isProgressStoreConfigured,
  rejectCopiedInitialProgress,
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

function sessionProfile(session: {
  user: { email?: string | null; name?: string | null; image?: string | null };
}) {
  return {
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
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

  const stored = await getCloudProgress(session.user.id);
  const progress = absorbAddedLessonClips(stored, listLessonClipCatalog());
  if (JSON.stringify(progress) !== JSON.stringify(stored)) {
    try {
      await setCloudProgress(session.user.id, progress, sessionProfile(session));
      await syncStudiedClips(session.user.id, progress);
    } catch (error) {
      console.error("absorbAddedLessonClips", error);
    }
  } else {
    await touchUserProfile(session.user.id, sessionProfile(session));
  }
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

  const progress = absorbAddedLessonClips(
    normalizeProgress(body as Partial<StoredProgress>),
    listLessonClipCatalog(),
  );
  const existing = await rejectCopiedInitialProgress(session.user.id, progress);
  if (existing) {
    return NextResponse.json({ progress: existing, ok: true, copied: true });
  }
  await setCloudProgress(session.user.id, progress, sessionProfile(session));
  try {
    await syncStudiedClips(session.user.id, progress);
  } catch (error) {
    console.error("syncStudiedClips", error);
  }
  return NextResponse.json({ progress, ok: true });
}
