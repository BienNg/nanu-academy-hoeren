"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearAdminStudentSignIns,
  deleteAdminStudentProgress,
  loadAdminStudentDetail,
  loadAdminStudentXp,
  setAdminUserInterviewAccess,
  setAdminUserLevelAccess,
  setAdminUserLivingAccess,
} from "@/app/admin/actions";
import { workplaceFromAccessSlug } from "@/lib/living-content";
import { MaterialIcon, StaffBadge, useAdminRole } from "@/components/admin/AdminShell";
import { Badge, Button, Dialog, buttonClass } from "@/components/admin/AdminUi";
import { AccountTab } from "@/components/admin/student-detail/AccountTab";
import { ActivityTab } from "@/components/admin/student-detail/ActivityTab";
import { CoursesTab, type PendingDelete } from "@/components/admin/student-detail/CoursesTab";
import { visibleLessons } from "@/components/admin/student-detail/meters";
import { OverviewTab } from "@/components/admin/student-detail/OverviewTab";
import { useNow, type DetailTab } from "@/components/admin/student-detail/shared";
import { RecapShareButton } from "@/components/RecapShareButton";
import {
  projectStudentDetail,
  projectStudentVisits,
  type AdminCatalogCourse,
  type AdminCourseDetail,
  type AdminVisitRange,
  type AdminXpEvent,
  type StudentProgressTarget,
} from "@/lib/admin-detail";
import { activeStreakDays, type StoredProgress } from "@/lib/progress";
import { formatAdminTimestamp, formatRelativeLastSeen, type AdminUserRow } from "@/lib/admin-overview";

export { LessonContentMeters } from "@/components/admin/student-detail/meters";

const DETAIL_TABS: { id: DetailTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "space_dashboard" },
  { id: "courses", label: "Courses", icon: "school" },
  { id: "activity", label: "Activity", icon: "timeline" },
  { id: "account", label: "Account", icon: "manage_accounts" },
];

export type StudentAccessPatch = {
  userId: string;
  levelAccess?: string[];
  interviewAccess?: boolean;
  livingAccess?: string[];
};

/** The per-student detail read, shared so the drawer can hand it to the modal. */
export type StudentDetailPayload = {
  progress: StoredProgress;
  signIns: AdminUserRow["signIns"];
  appUses: AdminUserRow["appUses"];
};

function DetailTabs({ tab, onChange }: { tab: DetailTab; onChange: (tab: DetailTab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Student detail"
      className="flex shrink-0 gap-space-4 overflow-x-auto border-b border-admin-hairline bg-admin-card px-space-16 sm:px-space-32"
    >
      {DETAIL_TABS.map((item) => {
        const selected = item.id === tab;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-space-4 border-b-2 px-space-8 py-space-12 text-admin-body-md font-semibold outline-none transition-colors focus-visible:shadow-admin-focus ${
              selected
                ? "border-admin-cobalt text-admin-cobalt"
                : "border-transparent text-admin-ink-muted hover:text-admin-ink"
            }`}
          >
            <MaterialIcon name={item.icon} className="text-[18px]" filled={selected} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function HeaderAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <Image
        src={image}
        alt=""
        width={64}
        height={64}
        referrerPolicy="no-referrer"
        className="h-14 w-14 shrink-0 rounded-full object-cover sm:h-16 sm:w-16"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-admin-cobalt font-admin-display text-[24px] font-semibold uppercase text-white sm:h-16 sm:w-16"
      aria-hidden="true"
    >
      {Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?"}
    </span>
  );
}

/**
 * Full-screen student detail with every tab and action. Mount it with
 * `key={row.userId}` (StudentDetail does) so a new student starts fresh.
 */
export function StudentDetailModal({
  row,
  catalog,
  onClose,
  onAccessChange,
  preloaded,
}: {
  row: AdminUserRow;
  catalog: readonly AdminCatalogCourse[];
  onClose: () => void;
  onAccessChange?: (patch: StudentAccessPatch) => void;
  /** Detail already read for `row.userId`, so opening from the drawer skips a refetch. */
  preloaded?: StudentDetailPayload;
}) {
  const router = useRouter();
  const canDelete = useAdminRole() === "owner";
  const [progressOverride, setProgressOverride] = useState<{
    userId: string;
    progress: StoredProgress;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [runsRevision, setRunsRevision] = useState(0);
  const [pendingHistoryClear, setPendingHistoryClear] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [payload, setPayload] = useState<StudentDetailPayload | null>(preloaded ?? null);
  const [detailError, setDetailError] = useState<string | null>(null);
  /** Null until read; reread after a delete, which can remove awards. */
  const [xp, setXp] = useState<{ revision: number; events: AdminXpEvent[] | null } | null>(null);
  const serverCaughtUp =
    progressOverride?.userId === row.userId &&
    (progressOverride.progress.adminClears ?? []).every((clear) =>
      (row.progress.adminClears ?? []).some((entry) => entry.id === clear.id),
    );
  const progress =
    progressOverride?.userId === row.userId && !serverCaughtUp
      ? progressOverride.progress
      : (payload?.progress ?? row.progress);
  const detailReady = payload != null;
  const detail = useMemo(
    () => projectStudentDetail(catalog, progress),
    [catalog, progress],
  );
  const [tab, setTab] = useState<DetailTab>("overview");
  const panelRef = useRef<HTMLDivElement>(null);
  const [courseId, setCourseId] = useState("");
  const [levelAccess, setLevelAccess] = useState(row.levelAccess);
  const [interviewAccess, setInterviewAccess] = useState(row.interviewAccess);
  const [livingAccess, setLivingAccess] = useState(row.livingAccess);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const accessSaveRef = useRef(false);
  const levels = detail.courses.filter((course) => course.kind === "cefr" && !course.living);
  const interviewCourses = detail.courses.filter((course) => course.kind === "ausbildung");
  const livingCourses = detail.courses.filter((course) => course.living);
  const course =
    detail.courses.find((entry) => entry.id === courseId) ??
    levels.find((entry) => entry.started) ??
    levels[0] ??
    detail.courses[0];
  const lessons = course ? visibleLessons(course) : [];
  const [range, setRange] = useState<AdminVisitRange>("7d");
  const xpEvents = xp?.revision === runsRevision ? xp.events : null;
  const visitLog = useMemo(
    () => projectStudentVisits(catalog, progress, range, undefined, xpEvents ?? []),
    [catalog, progress, range, xpEvents],
  );
  const streakDays = activeStreakDays(progress);
  const signIns = [...(payload?.signIns ?? row.signIns)].reverse();
  const appUses = [...(payload?.appUses ?? row.appUses)].reverse();
  const now = useNow();
  const lastSeen = formatRelativeLastSeen(row.lastLoginAt, new Date(now));
  const lastSeenExact = formatAdminTimestamp(row.lastLoginAt);

  // State only changes in the callback; the parent remounts this per student.
  useEffect(() => {
    if (preloaded) return;
    let cancelled = false;
    void loadAdminStudentDetail(row.userId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setDetailError(result.error);
        return;
      }
      setPayload({
        progress: result.progress,
        signIns: result.signIns,
        appUses: result.appUses,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [row.userId, preloaded]);

  useEffect(() => {
    let cancelled = false;
    void loadAdminStudentXp(row.userId).then((result) => {
      if (cancelled) return;
      setXp({ revision: runsRevision, events: result.ok ? result.events : null });
    });
    return () => {
      cancelled = true;
    };
  }, [row.userId, runsRevision]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    if (accessSaveRef.current) return;
    setLevelAccess(row.levelAccess);
    setInterviewAccess(row.interviewAccess);
    setLivingAccess(row.livingAccess);
  }, [row.userId, row.levelAccess, row.interviewAccess, row.livingAccess]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The delete dialog handles its own Escape.
      if (deleting || pendingDelete || clearingHistory || pendingHistoryClear) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [clearingHistory, deleting, onClose, pendingDelete, pendingHistoryClear]);

  function requestDelete(next: PendingDelete) {
    setDeleteError(null);
    setPendingDelete(next);
  }

  function closeDelete() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    const target: StudentProgressTarget =
      pendingDelete.scope === "all"
        ? { scope: "all" }
        : pendingDelete.scope === "course"
          ? { scope: "course", courseId: pendingDelete.courseId }
          : pendingDelete.scope === "lesson"
            ? {
                scope: "lesson",
                courseId: pendingDelete.courseId,
                lessonId: pendingDelete.lessonId,
              }
            : {
                scope: "part",
                courseId: pendingDelete.courseId,
                lessonId: pendingDelete.lessonId,
                part: pendingDelete.part,
              };
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAdminStudentProgress(row.userId, target);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setProgressOverride({ userId: row.userId, progress: result.progress });
    setRunsRevision((current) => current + 1);
    setPendingDelete(null);
    router.refresh();
  }

  function closeHistoryClear() {
    if (clearingHistory) return;
    setPendingHistoryClear(false);
    setHistoryError(null);
  }

  async function confirmHistoryClear() {
    if (clearingHistory) return;
    setClearingHistory(true);
    setHistoryError(null);
    const result = await clearAdminStudentSignIns(row.userId);
    setClearingHistory(false);
    if (!result.ok) {
      setHistoryError(result.error);
      return;
    }
    setPayload((current) => (current ? { ...current, signIns: [], appUses: [] } : current));
    setPendingHistoryClear(false);
    router.refresh();
  }

  function courseGranted(entry: AdminCourseDetail): boolean {
    if (row.isAdmin) return true;
    if (entry.living) {
      const workplace = workplaceFromAccessSlug(entry.id);
      return workplace != null && livingAccess.includes(workplace);
    }
    if (entry.kind === "ausbildung") return interviewAccess;
    return levelAccess.includes(entry.id);
  }

  async function toggleLevel(slug: string) {
    if (row.isAdmin || accessSaveRef.current) return;
    accessSaveRef.current = true;
    const current = levelAccess;
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    setLevelAccess(next);
    setAccessSaving(true);
    setAccessError(null);
    onAccessChange?.({ userId: row.userId, levelAccess: next });
    try {
      const result = await setAdminUserLevelAccess(row.userId, next);
      if (!result.ok) {
        setLevelAccess(current);
        onAccessChange?.({ userId: row.userId, levelAccess: current });
        setAccessError(result.error);
        return;
      }
      setLevelAccess(result.levelAccess);
      onAccessChange?.({ userId: row.userId, levelAccess: result.levelAccess });
      router.refresh();
    } finally {
      accessSaveRef.current = false;
      setAccessSaving(false);
    }
  }

  async function toggleInterview() {
    if (row.isAdmin || accessSaveRef.current) return;
    accessSaveRef.current = true;
    const current = interviewAccess;
    const next = !current;
    setInterviewAccess(next);
    setAccessSaving(true);
    setAccessError(null);
    onAccessChange?.({ userId: row.userId, interviewAccess: next });
    try {
      const result = await setAdminUserInterviewAccess(row.userId, next);
      if (!result.ok) {
        setInterviewAccess(current);
        onAccessChange?.({ userId: row.userId, interviewAccess: current });
        setAccessError(result.error);
        return;
      }
      setInterviewAccess(result.interviewAccess);
      onAccessChange?.({ userId: row.userId, interviewAccess: result.interviewAccess });
      router.refresh();
    } finally {
      accessSaveRef.current = false;
      setAccessSaving(false);
    }
  }

  async function toggleLiving(courseEntry: AdminCourseDetail) {
    const workplace = workplaceFromAccessSlug(courseEntry.id);
    if (!workplace || row.isAdmin || accessSaveRef.current) return;
    accessSaveRef.current = true;
    const current = livingAccess;
    const granted = !current.includes(workplace);
    const next = granted
      ? [...current, workplace]
      : current.filter((slug) => slug !== workplace);
    setLivingAccess(next);
    setAccessSaving(true);
    setAccessError(null);
    onAccessChange?.({ userId: row.userId, livingAccess: next });
    try {
      const result = await setAdminUserLivingAccess(row.userId, workplace, granted);
      if (!result.ok) {
        setLivingAccess(current);
        onAccessChange?.({ userId: row.userId, livingAccess: current });
        setAccessError(result.error);
        return;
      }
      setLivingAccess(result.livingAccess);
      onAccessChange?.({ userId: row.userId, livingAccess: result.livingAccess });
      router.refresh();
    } finally {
      accessSaveRef.current = false;
      setAccessSaving(false);
    }
  }

  const identityFacts: { label: string; value: string; title?: string }[] = [];
  if (row.email && row.email !== row.displayName) {
    identityFacts.push({ label: "Email", value: row.email });
  }
  if (lastSeen) {
    identityFacts.push({
      label: "Last seen",
      value: lastSeen,
      title: lastSeenExact ?? undefined,
    });
  }

  return (
    <>
      <div
        className="admin-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-admin-ink/40 sm:items-center sm:p-4 lg:p-6"
        role="presentation"
        onClick={() => {
          if (!deleting && !pendingDelete) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-detail-title"
          className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-admin-card border border-admin-border bg-admin-canvas shadow-admin-pop sm:h-[min(1100px,96dvh)] sm:max-w-[1320px] sm:rounded-admin-card xl:max-w-[1480px] 2xl:max-w-[1640px]"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="z-10 shrink-0 border-b border-admin-hairline bg-admin-card px-space-20 py-space-20 sm:px-space-32">
            <div className="flex items-start justify-between gap-space-16">
              <div className="flex min-w-0 flex-1 items-start gap-space-16">
                <HeaderAvatar name={row.displayName} image={row.image} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-space-8">
                    <p className="text-admin-label-sm uppercase text-admin-cobalt">Student</p>
                    {row.isAdmin ? <Badge tone="cobalt">Admin</Badge> : null}
                    {row.staff && !row.isAdmin ? <StaffBadge /> : null}
                    {row.className ? (
                      <Badge tone="cobalt">
                        <MaterialIcon name="school" className="-mx-0.5 text-[14px]" />
                        {row.className}
                      </Badge>
                    ) : null}
                    <Badge tone={streakDays > 0 ? "ember" : "neutral"}>
                      <MaterialIcon
                        name="local_fire_department"
                        className="-mx-0.5 text-[14px]"
                        filled={streakDays > 0}
                      />
                      {streakDays} {streakDays === 1 ? "day" : "days"}
                    </Badge>
                  </div>
                  <h2
                    id="student-detail-title"
                    className="mt-1 truncate font-admin-display text-admin-headline-lg text-admin-ink sm:text-admin-display-mobile"
                  >
                    {row.displayName}
                  </h2>
                  <dl className="mt-space-8 flex flex-wrap gap-x-space-32 gap-y-space-8">
                    {identityFacts.map((fact) => (
                      <div key={fact.label} className="min-w-0">
                        <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">{fact.label}</dt>
                        <dd
                          className="mt-0.5 max-w-[280px] truncate text-admin-body-sm text-admin-ink"
                          title={fact.title}
                        >
                          {fact.label === "Last seen" && row.lastLoginAt ? (
                            <time dateTime={row.lastLoginAt}>{fact.value}</time>
                          ) : (
                            fact.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-space-8">
                <RecapShareButton userId={row.userId} audience="staff" className={buttonClass("secondary")}>
                  <MaterialIcon name="ios_share" className="-ml-0.5 text-[18px]" />
                  <span className="hidden sm:inline">Weekly card</span>
                </RecapShareButton>
                {canDelete ? (
                  <Button
                    variant="destructive"
                    icon="delete"
                    disabled={!detailReady}
                    aria-label="Delete progress"
                    onClick={() =>
                      requestDelete({
                        scope: "all",
                        label: "all progress",
                        detail:
                          "Courses, Lektionen, videos, practice, visit history, and all XP are cleared. The account, class, and level access stay.",
                      })
                    }
                  >
                    <span className="hidden sm:inline">Delete progress</span>
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-control text-admin-ink-subtle outline-none transition-colors hover:bg-admin-subtle hover:text-admin-ink focus-visible:shadow-admin-focus"
                >
                  <MaterialIcon name="close" className="text-[20px]" />
                </button>
              </div>
            </div>
          </header>

          <DetailTabs tab={tab} onChange={setTab} />

          <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto px-space-20 py-space-20 sm:px-space-32 sm:py-space-24">
            {detailReady ? (
              <>
                {tab === "overview" ? (
                  <OverviewTab
                    range={range}
                    onRange={setRange}
                    summary={visitLog.summary}
                    chart={visitLog.chart}
                    xpState={
                      xp?.revision !== runsRevision ? "loading" : xpEvents ? "ready" : "error"
                    }
                  />
                ) : null}
                {tab === "courses" ? (
                  <CoursesTab
                    accessError={accessError}
                    levels={levels}
                    interviewCourses={interviewCourses}
                    livingCourses={livingCourses}
                    course={course}
                    lessons={lessons}
                    granted={courseGranted}
                    isAdmin={row.isAdmin}
                    interviewAccess={interviewAccess}
                    accessSaving={accessSaving}
                    canDelete={canDelete}
                    onSelectCourse={setCourseId}
                    onToggleLevel={(slug) => void toggleLevel(slug)}
                    onToggleInterview={() => void toggleInterview()}
                    onToggleLiving={(entry) => void toggleLiving(entry)}
                    onRequestDelete={requestDelete}
                  />
                ) : null}
                {tab === "activity" ? (
                  <ActivityTab
                    userId={row.userId}
                    catalog={catalog}
                    range={range}
                    onRange={setRange}
                    visitLog={visitLog}
                    runsRevision={runsRevision}
                    timeZone={progress.streakTimeZone}
                  />
                ) : null}
                {tab === "account" ? (
                  <AccountTab
                    signIns={signIns}
                    appUses={appUses}
                    onRequestClear={
                      canDelete
                        ? () => {
                            setHistoryError(null);
                            setPendingHistoryClear(true);
                          }
                        : undefined
                    }
                  />
                ) : null}
              </>
            ) : detailError ? (
              <p
                role="alert"
                className="rounded-admin-control border border-admin-crimson-border bg-admin-crimson-wash px-space-12 py-space-8 text-admin-body-sm text-admin-crimson-ink"
              >
                {detailError}
              </p>
            ) : (
              <p className="text-admin-body-md text-admin-ink-muted">Loading progress…</p>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={pendingDelete != null}
        onClose={closeDelete}
        title={`Delete ${pendingDelete?.label ?? "progress"}?`}
        description={
          pendingDelete ? (
            <>
              {pendingDelete.detail} {row.displayName}&apos;s open app drops it the next time it syncs.
            </>
          ) : null
        }
        actions={
          <>
            <Button disabled={deleting} onClick={closeDelete}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              icon="delete"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete progress"}
            </Button>
          </>
        }
      >
        {deleteError ? (
          <p role="alert" className="text-admin-body-sm text-admin-crimson">
            {deleteError}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={pendingHistoryClear}
        onClose={closeHistoryClear}
        title="Clear sign-in history?"
        description={
          <>
            {row.displayName}&apos;s sign-ins and app use are cleared. Progress, XP, class, and level
            access stay. New sign-ins are recorded again from now on.
          </>
        }
        actions={
          <>
            <Button disabled={clearingHistory} onClick={closeHistoryClear}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              icon="delete"
              disabled={clearingHistory}
              onClick={() => void confirmHistoryClear()}
            >
              {clearingHistory ? "Clearing…" : "Clear history"}
            </Button>
          </>
        }
      >
        {historyError ? (
          <p role="alert" className="text-admin-body-sm text-admin-crimson">
            {historyError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
