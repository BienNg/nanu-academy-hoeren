import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCefrLevel } from "@/lib/levels";
import type { LessonFinishSide } from "@/lib/progress";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { loadClassmateFinishes } from "@/lib/xp-store";

function revokedResponse() {
  return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
}

function readSide(value: string | null): LessonFinishSide | null {
  return value === "study" || value === "practice" ? value : null;
}

function readLessonKey(value: string | null): string | null {
  if (!value || value.length > 80) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(value)) return null;
  return value;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const lessonKey = readLessonKey(url.searchParams.get("lesson"));
  const side = readSide(url.searchParams.get("side"));
  const levelSlug = url.searchParams.get("level");
  const level = levelSlug ? getCefrLevel(levelSlug) : null;
  const oneLesson = lessonKey != null && side != null;

  if (!oneLesson && !level) {
    return NextResponse.json({ error: "Missing lesson or level" }, { status: 400 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json(oneLesson ? { ready: false, finish: null } : { ready: false, lessons: {} });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const map = await loadClassmateFinishes(
    session.user.id,
    session.user.image,
    oneLesson ? { lessonKey, side } : { levelSlug: level!.slug },
  );

  if (oneLesson) {
    return NextResponse.json({ ready: map.ready, finish: map.lessons[lessonKey]?.[side] ?? null });
  }
  return NextResponse.json(map);
}
