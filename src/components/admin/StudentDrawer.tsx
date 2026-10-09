"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { loadAdminStudentDetail, loadAdminStudentXp } from "@/app/admin/actions";
import {
  MaterialIcon,
  StaffBadge,
  TeacherBadge,
  useAdminPageRange,
} from "@/components/admin/AdminShell";
import { Badge, Button, Drawer, buttonClass, formatCount } from "@/components/admin/AdminUi";
import {
  StudentDetailModal,
  type StudentAccessPatch,
  type StudentDetailPayload,
} from "@/components/admin/StudentDetailModal";
import { VisitDayList, InstalledAppBadge, PwaPromptList } from "@/components/admin/student-detail/ActivityTab";
import { LessonTimingPath } from "@/components/admin/student-detail/LessonTimingPath";
import { useNow } from "@/components/admin/student-detail/shared";
import { RecapShareButton } from "@/components/RecapShareButton";
import {
  projectStudentVisits,
  summarizeStudentXp,
  type AdminCatalogCourse,
  type AdminXpEvent,
  type AdminXpSource,
} from "@/lib/admin-detail";
import {
  adminRangeLabel,
  adminRangeVietnamDayKeys,
  formatAdminTimestamp,
  formatRelativeLastSeen,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { activeStreakDays, formatActiveDuration } from "@/lib/progress";
import { dayKey } from "@/lib/xp";

type XpLoadState = { userId: string; events: AdminXpEvent[] | null };

const XP_SOURCE_COLOR: Record<AdminXpSource, string> = {
  practice: ADMIN_COLORS.amber,
  review: ADMIN_COLORS.amberSoft,
  study: ADMIN_COLORS.emerald,
  jump: ADMIN_COLORS.violet,
  duel: ADMIN_COLORS.cobalt,
  quest: ADMIN_COLORS.ember,
};

type LoadState =
  | { userId: string; ok: true; payload: StudentDetailPayload }
  | { userId: string; ok: false; error: string };

function DrawerAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <Image
        src={image}
        alt=""
        width={48}
        height={48}
        referrerPolicy="no-referrer"
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-admin-cobalt font-admin-display text-[20px] font-semibold uppercase text-white"
      aria-hidden="true"
    >
      {Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?"}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-admin-hairline px-space-20 py-space-16 last:border-b-0">
      <h3 className="pb-space-12 text-admin-label-sm uppercase text-admin-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

function StatGrid({
  items,
}: {
  items: readonly { label: string; value: string; hint?: string; color?: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-admin-control border border-admin-hairline bg-admin-hairline">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col bg-admin-card px-space-12 py-space-8">
          <dt className="truncate text-admin-body-sm text-admin-ink-muted">{item.label}</dt>
          <dd
            className="font-admin-display text-[22px] font-semibold leading-7 tabular-nums text-admin-ink"
            style={item.color ? { color: item.color } : undefined}
          >
            {item.value}
          </dd>
          {item.hint ? (
            <dd className="truncate text-[12px] leading-4 text-admin-ink-subtle">{item.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function SubHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-space-8 pb-space-8 pt-space-16">
      <h4 className="text-admin-body-sm font-semibold text-admin-ink">{title}</h4>
      {meta ? <span className="text-[12px] leading-4 text-admin-ink-subtle">{meta}</span> : null}
    </div>
  );
}

const LIST = "divide-y divide-admin-hairline overflow-hidden rounded-admin-control border border-admin-hairline";
const ROW = "flex items-center gap-space-8 bg-admin-card px-space-12 py-space-8 text-admin-body-sm";

function rangePeriod(range: AdminRange): string {
  return range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
}

function XpSummary({
  catalog,
  events,
  range,
}: {
  catalog: readonly AdminCatalogCourse[];
  events: readonly AdminXpEvent[];
  range: AdminRange;
}) {
  const now = useNow();
  const xp = useMemo(() => {
    const days = new Set(adminRangeVietnamDayKeys(range, new Date(now)));
    const rangedEvents = events.filter((event) =>
      days.has(event.dayKey ?? dayKey(new Date(event.at))),
    );
    return summarizeStudentXp(catalog, rangedEvents, new Date(now));
  }, [catalog, events, now, range]);
  const awardHint =
    range === "today"
      ? xp.awards === 1
        ? "award today"
        : "awards today"
      : xp.awards === 1
        ? "award"
        : "awards";

  return (
    <Section title="XP">
      <StatGrid
        items={[
          {
            label: adminRangeLabel(range),
            value: formatCount(xp.total),
            hint: "Vietnam time",
            color: xp.total > 0 ? ADMIN_COLORS.amber : undefined,
          },
          {
            label: "Awards",
            value: formatCount(xp.awards),
            hint: awardHint,
          },
        ]}
      />
      {xp.sources.length === 0 ? (
        <p className="pt-space-12 text-admin-body-sm text-admin-ink-subtle">
          No XP earned {rangePeriod(range)}.
        </p>
      ) : (
        <>
          <SubHeading
            title="By source"
            meta={range === "today" ? "Share of today" : "Share"}
          />
          <div
            className="mb-space-8 flex h-2 gap-px overflow-hidden rounded-full bg-admin-subtle"
            role="img"
            aria-label={xp.sources
              .map((entry) => `${entry.label} ${Math.round((entry.xp / xp.total) * 100)}%`)
              .join(", ")}
          >
            {xp.sources.map((entry) => (
              <div
                key={entry.source}
                className="h-full"
                style={{
                  width: `${(entry.xp / xp.total) * 100}%`,
                  backgroundColor: XP_SOURCE_COLOR[entry.source],
                }}
              />
            ))}
          </div>
          <ul className={LIST}>
            {xp.sources.map((entry) => (
              <li key={entry.source} className={ROW}>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: XP_SOURCE_COLOR[entry.source] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-admin-ink">{entry.label}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-admin-ink-subtle">
                  {formatCount(entry.awards)}×
                </span>
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-admin-ink">
                  {formatCount(entry.xp)}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-admin-ink-muted">
                  {Math.round((entry.xp / xp.total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
          {xp.lessons.length > 0 ? (
            <>
              <SubHeading title="Top lessons" meta="Practice, study and jump XP" />
              <ol className={LIST}>
                {xp.lessons.map((lesson, index) => (
                  <li key={lesson.lessonKey} className={ROW}>
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-admin-badge bg-admin-subtle text-[11px] font-semibold tabular-nums text-admin-ink-subtle">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-admin-ink">{lesson.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-admin-ink">
                      {formatCount(lesson.xp)}
                      <span className="ml-0.5 text-[11px] font-normal text-admin-ink-subtle">XP</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      )}
    </Section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-space-16 px-space-20 py-space-16" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-space-8">
          <div className="h-3 w-24 animate-pulse rounded-admin-badge bg-admin-subtle" />
          <div className="h-[7.5rem] animate-pulse rounded-admin-control bg-admin-subtle" />
        </div>
      ))}
    </div>
  );
}

/** Same calendar the header date tab uses. */
const ADMIN_RANGE_ZONE = "Asia/Ho_Chi_Minh";

function StudentSummary({
  userId,
  catalog,
  payload,
  range,
}: {
  userId: string;
  catalog: readonly AdminCatalogCourse[];
  payload: StudentDetailPayload;
  range: AdminRange;
}) {
  const visitLog = useMemo(
    () =>
      projectStudentVisits(
        catalog,
        { ...payload.progress, streakTimeZone: ADMIN_RANGE_ZONE },
        range,
      ),
    [catalog, payload.progress, range],
  );
  const summary = visitLog.summary;

  return (
    <>
      <Section title={adminRangeLabel(range)}>
        <StatGrid
          items={[
            {
              label: "Active time",
              value: formatActiveDuration(summary.activeSeconds),
              hint: `${formatCount(summary.visitCount)} ${summary.visitCount === 1 ? "visit" : "visits"}`,
              color: summary.activeSeconds > 0 ? ADMIN_COLORS.ember : undefined,
            },
            { label: "Clips studied", value: formatCount(summary.clipCount) },
            {
              label: "Practice runs",
              value: formatCount(summary.listeningRuns),
              hint: `${formatCount(summary.exercisesCompleted)} practice clips`,
            },
            {
              label: "Video",
              value: formatActiveDuration(summary.videoSeconds),
              hint: `${formatCount(summary.videosWatched)} marked watched`,
            },
          ]}
        />
      </Section>

      <section className="flex flex-col gap-space-24 px-space-12 py-space-16">
        {visitLog.visits.length === 0 ? (
          <p className="px-space-8 text-admin-body-sm text-admin-ink-subtle">{visitLog.emptyMessage}</p>
        ) : null}
        <VisitDayList
          visits={visitLog.visits}
          userId={userId}
          range={range}
          timeZone={ADMIN_RANGE_ZONE}
        />
      </section>
    </>
  );
}

/**
 * Student detail entry point for every admin list: a 420px drawer with the
 * essentials, and a button that opens the full-screen detail modal.
 */
export function StudentDetail({
  row,
  catalog,
  onClose,
  onAccessChange,
  focusLevelSlug,
}: {
  row: AdminUserRow;
  catalog: readonly AdminCatalogCourse[];
  onClose: () => void;
  onAccessChange?: (patch: StudentAccessPatch) => void;
  /** Level open on the Levels path. The drawer then shows that Lektion trail. */
  focusLevelSlug?: string;
}) {
  const [load, setLoad] = useState<LoadState | null>(null);
  const [xpLoad, setXpLoad] = useState<XpLoadState | null>(null);
  const [fullUserId, setFullUserId] = useState<string | null>(null);
  const current = load?.userId === row.userId ? load : null;
  const full = fullUserId === row.userId;

  useEffect(() => {
    let cancelled = false;
    void loadAdminStudentDetail(row.userId).then((result) => {
      if (cancelled) return;
      setLoad(
        result.ok
          ? {
              userId: row.userId,
              ok: true,
              payload: {
                progress: result.progress,
                signIns: result.signIns,
                appUses: result.appUses,
                startSignals: result.startSignals,
              },
            }
          : { userId: row.userId, ok: false, error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [row.userId]);

  useEffect(() => {
    let cancelled = false;
    void loadAdminStudentXp(row.userId).then((result) => {
      if (cancelled) return;
      setXpLoad({ userId: row.userId, events: result.ok ? result.events : null });
    });
    return () => {
      cancelled = true;
    };
  }, [row.userId]);

  const xpCurrent = xpLoad?.userId === row.userId ? xpLoad : null;
  const now = useNow();
  const range = useAdminPageRange() ?? "today";

  if (full) {
    return (
      <StudentDetailModal
        key={row.userId}
        row={row}
        catalog={catalog}
        onClose={onClose}
        onAccessChange={onAccessChange}
        focusLevelSlug={focusLevelSlug}
        preloaded={current?.ok ? current.payload : undefined}
      />
    );
  }

  const streakDays = activeStreakDays(current?.ok ? current.payload.progress : row.progress);
  const studentProgress = current?.ok ? current.payload.progress : row.progress;
  const lastSeen = formatRelativeLastSeen(row.lastLoginAt, new Date(now));
  const lastSeenExact = formatAdminTimestamp(row.lastLoginAt);

  return (
    <Drawer
      open
      onClose={onClose}
      title={row.displayName}
      header={
        <div className="flex min-w-0 items-center gap-space-12">
          <DrawerAvatar name={row.displayName} image={row.image} />
          <div className="min-w-0">
            <p className="truncate font-admin-display text-admin-headline-md text-admin-ink">
              {row.displayName}
            </p>
            {row.email && row.email !== row.displayName ? (
              <p className="truncate text-admin-body-sm text-admin-ink-subtle">{row.email}</p>
            ) : null}
          </div>
        </div>
      }
      footer={
        <>
          <RecapShareButton
            userId={row.userId}
            audience="staff"
            className={buttonClass("secondary")}
          >
            <MaterialIcon name="ios_share" className="-ml-0.5 text-[18px]" />
            Weekly card
          </RecapShareButton>
          <Button variant="primary" icon="open_in_full" onClick={() => setFullUserId(row.userId)}>
            Open full details
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-space-12 border-b border-admin-hairline px-space-20 py-space-16">
        <div className="flex flex-wrap items-center gap-space-8">
          {row.isAdmin ? <Badge tone="cobalt">Admin</Badge> : null}
          {row.staff && !row.isAdmin ? <StaffBadge /> : null}
          {row.teacher && !row.isAdmin ? <TeacherBadge /> : null}
          <Badge tone={row.className ? "cobalt" : "neutral"}>
            <MaterialIcon name="school" className="-mx-0.5 text-[14px]" />
            {row.className ?? "No class"}
          </Badge>
          <Badge tone={streakDays > 0 ? "ember" : "neutral"}>
            <MaterialIcon
              name="local_fire_department"
              className="-mx-0.5 text-[14px]"
              filled={streakDays > 0}
            />
            {streakDays} {streakDays === 1 ? "day" : "days"}
          </Badge>
          {studentProgress.pwaInstalledAt ? <InstalledAppBadge /> : null}
        </div>
        <PwaPromptList progress={studentProgress} />
        <dl>
          <div className="min-w-0">
            <dt className="text-admin-body-sm text-admin-ink-muted">Last seen</dt>
            <dd className="truncate text-admin-body-md text-admin-ink" title={lastSeenExact ?? undefined}>
              {row.lastLoginAt && lastSeen ? (
                <time dateTime={row.lastLoginAt}>{lastSeen}</time>
              ) : (
                "Not seen yet"
              )}
            </dd>
          </div>
        </dl>
      </div>

      {xpCurrent == null ? null : xpCurrent.events ? (
        <XpSummary catalog={catalog} events={xpCurrent.events} range={range} />
      ) : (
        <Section title="XP">
          <p className="text-admin-body-sm text-admin-ink-subtle">Could not load XP.</p>
        </Section>
      )}

      {current == null ? (
        <DrawerSkeleton />
      ) : current.ok ? (
        <>
          {focusLevelSlug ? (
            <div className="border-b border-admin-hairline px-space-20 py-space-16">
              <LessonTimingPath
                course={catalog.find((entry) => entry.id === focusLevelSlug)}
                progress={current.payload.progress}
                signInAts={current.payload.signIns.map((entry) => entry.at)}
                signals={current.payload.startSignals}
              />
            </div>
          ) : null}
          <StudentSummary
            userId={row.userId}
            catalog={catalog}
            payload={current.payload}
            range={range}
          />
        </>
      ) : (
        <p
          role="alert"
          className="m-space-20 rounded-admin-control border border-admin-crimson-border bg-admin-crimson-wash px-space-12 py-space-8 text-admin-body-sm text-admin-crimson-ink"
        >
          {current.error}
        </p>
      )}
    </Drawer>
  );
}
