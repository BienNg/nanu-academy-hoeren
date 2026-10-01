import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  absorbAddedLessonClips,
  mergeProgress,
  normalizeProgress,
  progressKeepingServerClears,
  signInContextFromHeaders,
  type StoredProgress,
} from "@/lib/progress";
import { listLessonClipCatalog } from "@/lib/levels";
import { listLivingClipCatalog } from "@/lib/living";
import { syncStudiedClips } from "@/lib/duel-store";
import {
  getCloudProgress,
  isProgressStoreConfigured,
  recordAppUse,
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

async function noteAppUse(userId: string): Promise<void> {
  try {
    await recordAppUse(userId, signInContextFromHeaders(await headers()));
  } catch (error) {
    console.error("Failed to record app use", error);
  }
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
  const progress = absorbAddedLessonClips(stored, [...listLessonClipCatalog(), ...listLivingClipCatalog()]);
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
  await noteAppUse(session.user.id);
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

  const uploaded = normalizeProgress(body as Partial<StoredProgress>);
  const existing = await rejectCopiedInitialProgress(session.user.id, uploaded);
  if (existing) {
    await noteAppUse(session.user.id);
    return NextResponse.json({ progress: existing, ok: true, copied: true });
  }
  const stored = await getCloudProgress(session.user.id);
  const progress = absorbAddedLessonClips(
    mergeProgress(stored, progressKeepingServerClears(uploaded, stored)),
    [...listLessonClipCatalog(), ...listLivingClipCatalog()],
  );
  await setCloudProgress(session.user.id, progress, sessionProfile(session));
  try {
    await syncStudiedClips(session.user.id, progress);
  } catch (error) {
    console.error("syncStudiedClips", error);
  }
  await noteAppUse(session.user.id);
  return NextResponse.json({ progress, ok: true });
}
