"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { loadAdminStudentDetail, loadAdminStudentXp } from "@/app/admin/actions";
import { MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import { Badge, Button, Drawer, buttonClass, formatCount } from "@/components/admin/AdminUi";
import {
  StudentDetailModal,
  type StudentAccessPatch,
  type StudentDetailPayload,
} from "@/components/admin/StudentDetailModal";
import { VisitDayList } from "@/components/admin/student-detail/ActivityTab";
import { useNow } from "@/components/admin/student-detail/shared";
import { RecapShareButton } from "@/components/RecapShareButton";
import {
  projectStudentVisits,
  summarizeStudentXp,
  type AdminCatalogCourse,
  type AdminXpEvent,
  type AdminXpSource,
} from "@/lib/admin-detail";
import { formatAdminTimestamp, formatRelativeLastSeen, type AdminUserRow } from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { activeStreakDays, formatActiveDuration } from "@/lib/progress";

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

function XpSummary({
  catalog,
  events,
}: {
  catalog: readonly AdminCatalogCourse[];
  events: readonly AdminXpEvent[];
}) {
  const xp = useMemo(() => summarizeStudentXp(catalog, events), [catalog, events]);

  return (
    <Section title="XP">
      <StatGrid
        items={[
          {
            label: "Total XP",
            value: formatCount(xp.total),
            hint: `${formatCount(xp.awards)} ${xp.awards === 1 ? "award" : "awards"}`,
            color: xp.total > 0 ? ADMIN_COLORS.amber : undefined,
          },
          {
            label: "This week",
            value: formatCount(xp.week),
            hint: `${formatCount(xp.today)} today · Vietnam time`,
          },
        ]}
      />
      {xp.sources.length === 0 ? (
        <p className="pt-space-12 text-admin-body-sm text-admin-ink-subtle">No XP earned yet.</p>
      ) : (
        <>
          <SubHeading title="By source" meta="Share of total" />
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

function StudentSummary({
  userId,
  catalog,
  payload,
}: {
  userId: string;
  catalog: readonly AdminCatalogCourse[];
  payload: StudentDetailPayload;
}) {
  const todayLog = useMemo(
    () => projectStudentVisits(catalog, payload.progress, "today"),
    [catalog, payload.progress],
  );
  const today = todayLog.summary;

  return (
    <>
      <Section title="Today">
        <StatGrid
          items={[
            {
              label: "Active time",
              value: formatActiveDuration(today.activeSeconds),
              hint: `${formatCount(today.visitCount)} ${today.visitCount === 1 ? "visit" : "visits"}`,
              color: today.activeSeconds > 0 ? ADMIN_COLORS.ember : undefined,
            },
            { label: "Clips studied", value: formatCount(today.clipCount) },
            {
              label: "Practice runs",
              value: formatCount(today.listeningRuns),
              hint: `${formatCount(today.exercisesCompleted)} practice clips`,
            },
            {
              label: "Video",
              value: formatActiveDuration(today.videoSeconds),
              hint: `${formatCount(today.videosWatched)} marked watched`,
            },
          ]}
        />
      </Section>

      <section className="flex flex-col gap-space-24 px-space-12 py-space-16">
        {todayLog.visits.length === 0 ? (
          <p className="px-space-8 text-admin-body-sm text-admin-ink-subtle">{todayLog.emptyMessage}</p>
        ) : (
          <VisitDayList
            visits={todayLog.visits}
            userId={userId}
            range="today"
            timeZone={payload.progress.streakTimeZone}
          />
        )}
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
}: {
  row: AdminUserRow;
  catalog: readonly AdminCatalogCourse[];
  onClose: () => void;
  onAccessChange?: (patch: StudentAccessPatch) => void;
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

  if (full) {
    return (
      <StudentDetailModal
        key={row.userId}
        row={row}
        catalog={catalog}
        onClose={onClose}
        onAccessChange={onAccessChange}
        preloaded={current?.ok ? current.payload : undefined}
      />
    );
  }

  const streakDays = activeStreakDays(current?.ok ? current.payload.progress : row.progress);
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
        </div>
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
        <XpSummary catalog={catalog} events={xpCurrent.events} />
      ) : (
        <Section title="XP">
          <p className="text-admin-body-sm text-admin-ink-subtle">Could not load XP.</p>
        </Section>
      )}

      {current == null ? (
        <DrawerSkeleton />
      ) : current.ok ? (
        <StudentSummary userId={row.userId} catalog={catalog} payload={current.payload} />
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
