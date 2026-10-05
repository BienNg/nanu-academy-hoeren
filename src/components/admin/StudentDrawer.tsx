"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { loadAdminStudentDetail } from "@/app/admin/actions";
import { MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import { Badge, Button, Drawer, buttonClass, formatCount } from "@/components/admin/AdminUi";
import {
  StudentDetailModal,
  type StudentAccessPatch,
  type StudentDetailPayload,
} from "@/components/admin/StudentDetailModal";
import { VisitDayList } from "@/components/admin/student-detail/ActivityTab";
import { RecapShareButton } from "@/components/RecapShareButton";
import { projectStudentVisits, type AdminCatalogCourse } from "@/lib/admin-detail";
import { formatAdminTimestamp, type AdminUserRow } from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { activeStreakDays, formatActiveDuration } from "@/lib/progress";

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
  catalog,
  payload,
}: {
  catalog: readonly AdminCatalogCourse[];
  payload: StudentDetailPayload;
}) {
  const weekLog = useMemo(
    () => projectStudentVisits(catalog, payload.progress, "7d"),
    [catalog, payload.progress],
  );
  const week = weekLog.summary;

  return (
    <>
      <Section title="Last 7 days">
        <StatGrid
          items={[
            {
              label: "Active time",
              value: formatActiveDuration(week.activeSeconds),
              hint: `${formatCount(week.visitCount)} ${week.visitCount === 1 ? "visit" : "visits"}`,
              color: week.activeSeconds > 0 ? ADMIN_COLORS.ember : undefined,
            },
            { label: "Clips studied", value: formatCount(week.clipCount) },
            {
              label: "Practice runs",
              value: formatCount(week.listeningRuns),
              hint: `${formatCount(week.exercisesCompleted)} practice clips`,
            },
            {
              label: "Video",
              value: formatActiveDuration(week.videoSeconds),
              hint: `${formatCount(week.videosWatched)} marked watched`,
            },
          ]}
        />
      </Section>

      <section className="px-space-12 py-space-16">
        {weekLog.visits.length === 0 ? (
          <p className="px-space-8 text-admin-body-sm text-admin-ink-subtle">{weekLog.emptyMessage}</p>
        ) : (
          <VisitDayList visits={weekLog.visits} />
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
  const lastSeen = formatAdminTimestamp(row.lastLoginAt);
  const signIns = current?.ok ? current.payload.signIns : row.signIns;
  const lastSignIn = formatAdminTimestamp(signIns[signIns.length - 1]?.at ?? row.lastSignInAt);

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
        <dl className="grid grid-cols-2 gap-space-12">
          <div className="min-w-0">
            <dt className="text-admin-body-sm text-admin-ink-muted">Last seen</dt>
            <dd className="truncate text-admin-body-md text-admin-ink">{lastSeen ?? "Not seen yet"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-admin-body-sm text-admin-ink-muted">Sign-in</dt>
            <dd className="truncate text-admin-body-md text-admin-ink">
              {lastSignIn ?? "None recorded"}
            </dd>
          </div>
        </dl>
      </div>

      {current == null ? (
        <DrawerSkeleton />
      ) : current.ok ? (
        <StudentSummary catalog={catalog} payload={current.payload} />
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
