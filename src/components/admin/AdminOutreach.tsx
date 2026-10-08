"use client";

import { Fragment, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { saveOutreachCase } from "@/app/admin/outreach/actions";
import { AdminPageHeader, MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import {
  AdminOutreachCase,
  CopyButton,
  OUTREACH_GROUP_TONE,
} from "@/components/admin/AdminOutreachCase";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  Badge,
  Button,
  CARD,
  CountPill,
  IconTile,
  KpiTile,
  SearchField,
  Segmented,
  ShareBar,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  formatPercent,
} from "@/components/admin/AdminUi";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import type { OutreachPerson } from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import {
  OUTREACH_GROUPS,
  OUTREACH_GROUP_LABEL,
  OUTREACH_JOBS,
  OUTREACH_JOB_HINT,
  OUTREACH_JOB_LABEL,
  OUTREACH_OWNER_FILTERS,
  OUTREACH_OWNER_FILTER_LABEL,
  OUTREACH_REASON_LABEL,
  OUTREACH_STATUS_LABEL,
  joinOutreach,
  outreachAddress,
  outreachCheckIn,
  outreachDoneTodayJob,
  outreachJobFor,
  outreachJobWhy,
  outreachLastSentOn,
  outreachMatchesQuery,
  outreachMessage1,
  outreachMessage2,
  outreachOwnerMatches,
  outreachPrimarySend,
  outreachRelativeDay,
  summarizeOutreach,
  type OutreachCase,
  type OutreachJobId,
  type OutreachOwnerFilter,
  type OutreachRow,
} from "@/lib/outreach";

type View = "queue" | "picture";
type JobPick = OutreachJobId | "all";

function isJobPick(value: string | null): value is JobPick {
  return value === "all" || (OUTREACH_JOBS as readonly string[]).includes(value ?? "");
}

function Notice({ children }: { children: string }) {
  return (
    <p className="rounded-admin-card border border-admin-hairline bg-admin-subtle px-space-16 py-space-12 text-admin-body-sm text-admin-ink-muted">
      {children}
    </p>
  );
}

function displayName(name: string | null, email: string | null): string {
  return name?.trim() || email?.trim() || "Chưa đăng ký";
}

function syncUrl(view: View, job: JobPick | null) {
  const url = new URL(window.location.href);
  if (view === "queue") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (job) url.searchParams.set("job", job);
  else url.searchParams.delete("job");
  window.history.replaceState(window.history.state, "", url);
}

/** The template for this job, when one message fits the whole group. */
function quickMessage(row: OutreachRow, job: OutreachJobId): string | null {
  const address = outreachAddress(row.outreachCase?.greetingName);
  if (job === "followup") return null;
  if (job === "quiet") return outreachCheckIn(address);
  if (job === "tin2") {
    const message = outreachMessage2(row.category, address);
    return message.kind === "message" ? message.text : null;
  }
  return outreachMessage1(row.category, address);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function OwnerChip({ row, viewerId }: { row: OutreachRow; viewerId: string }) {
  const outreachCase = row.outreachCase;
  if (!outreachCase?.ownerUserId) return <span className="text-admin-body-sm text-admin-ink-faint">—</span>;
  const mine = outreachCase.ownerUserId === viewerId;
  const name = outreachCase.ownerName?.trim() || "Không tên";
  return (
    <span className="inline-flex max-w-40 items-center gap-space-8" title={name}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          mine ? "bg-admin-cobalt text-white" : "bg-admin-subtle text-admin-ink-muted"
        }`}
        aria-hidden="true"
      >
        {initials(name) || "?"}
      </span>
      <span className="truncate text-admin-body-sm text-admin-ink">{mine ? "Bạn" : name}</span>
    </span>
  );
}

function WhyText({ row, job, today }: { row: OutreachRow; job: OutreachJobId; today: string }) {
  const why = outreachJobWhy(row, job, today);
  if (why.overdue) {
    return (
      <Badge tone="crimson" dot>
        {why.text}
      </Badge>
    );
  }
  return <span className="text-admin-body-sm text-admin-ink-muted">{why.text}</span>;
}

function RowActions({
  row,
  job,
  busy,
  canSave,
  onSend,
  className,
}: {
  row: OutreachRow;
  job: OutreachJobId;
  busy: boolean;
  canSave: boolean;
  onSend: () => void;
  className?: string;
}) {
  const text = quickMessage(row, job);
  const send = job === "followup" ? null : outreachPrimarySend(job, row.status, row.category);
  const canSend = send != null && canSave && row.email != null;
  if (!text && !canSend) return null;
  return (
    <div
      className={`flex items-center gap-space-4 ${className ?? ""}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {text ? <CopyButton variant="ghost" text={text} label="Chép tin" /> : null}
      {canSend ? (
        <Button variant="ghost" icon="done" disabled={busy} onClick={onSend}>
          {busy ? "Đang lưu" : "Đã gửi"}
        </Button>
      ) : null}
    </div>
  );
}

function RailItem({
  label,
  count,
  done,
  alert,
  on,
  onClick,
}: {
  label: string;
  count: number;
  done: number;
  alert: boolean;
  on: boolean;
  onClick: () => void;
}) {
  const idle = count === 0 ? "text-admin-ink-faint" : "text-admin-ink";
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onClick}
      className={`flex w-full shrink-0 items-center gap-space-8 whitespace-nowrap rounded-admin-control border px-space-12 py-space-8 text-left text-admin-body-md outline-none transition-colors focus-visible:shadow-admin-focus ${
        on
          ? "border-admin-cobalt bg-admin-cobalt-wash font-semibold text-admin-cobalt-ink"
          : `border-admin-hairline bg-admin-card hover:border-admin-border lg:border-transparent lg:bg-transparent lg:hover:bg-admin-subtle ${idle}`
      }`}
    >
      {alert ? <span className="h-2 w-2 shrink-0 rounded-full bg-admin-crimson" aria-label="Có việc quá hạn" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {done > 0 ? (
        <span
          className="inline-flex items-center text-admin-label-md tabular-nums text-admin-emerald-ink"
          title="Xong hôm nay"
        >
          <MaterialIcon name="check" className="text-[14px]" />
          {formatCount(done)}
        </span>
      ) : null}
      <CountPill value={count} tone={alert ? "alert" : on ? "peak" : "neutral"} />
    </button>
  );
}

function BarList({
  title,
  hint,
  items,
  color,
  empty,
}: {
  title: string;
  hint?: string;
  items: readonly { label: string; count: number }[];
  color: string;
  empty: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className={`${CARD} p-space-16 sm:p-space-20`}>
      <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">{title}</h2>
      {hint ? <p className="mt-space-4 text-admin-body-sm text-admin-ink-muted">{hint}</p> : null}
      {items.length === 0 ? (
        <p className="mt-space-16 text-admin-body-sm text-admin-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-space-16 flex flex-col gap-space-12">
          {items.map((item) => (
            <li key={item.label} className="flex flex-col gap-space-4">
              <div className="flex items-center justify-between gap-space-12 text-admin-body-md">
                <span className="min-w-0 truncate text-admin-ink">{item.label}</span>
                <span className="tabular-nums font-semibold text-admin-ink">{formatCount(item.count)}</span>
              </div>
              <ShareBar share={item.count / max} color={color} label={item.label} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-space-12 px-space-16 py-space-32 text-center">
      <IconTile icon={icon} color={ADMIN_COLORS.emerald} size="lg" />
      <p className="font-admin-display text-admin-headline-sm text-admin-ink">{title}</p>
      <p className="max-w-md text-admin-body-sm text-admin-ink-muted">{text}</p>
      {children}
    </div>
  );
}

/** Enter or Space opens the row; J/K and the arrow keys move between rows. */
function rowKeyDown(event: KeyboardEvent<HTMLElement>, open: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open();
    return;
  }
  const delta =
    event.key === "j" || event.key === "ArrowDown" ? 1 : event.key === "k" || event.key === "ArrowUp" ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const list = event.currentTarget.closest("[data-outreach-list]");
  const items = list ? [...list.querySelectorAll<HTMLElement>("[data-outreach-row]")] : [];
  items[items.indexOf(event.currentTarget) + delta]?.focus();
}

export function AdminOutreach({
  people,
  cases,
  casesReady,
  today,
  viewerId,
  catalog,
  storeConfigured,
  pendingReady,
  initialView,
  initialJob,
}: {
  people: readonly OutreachPerson[];
  cases: readonly OutreachCase[];
  casesReady: boolean;
  today: string;
  viewerId: string;
  catalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
  pendingReady: boolean;
  initialView: View;
  initialJob: string | null;
}) {
  const [savedCases, setSavedCases] = useState<readonly OutreachCase[]>(cases);
  const [view, setView] = useState<View>(initialView);
  const [pickedJob, setPickedJob] = useState<JobPick | null>(isJobPick(initialJob) ? initialJob : null);
  const [owner, setOwner] = useState<OutreachOwnerFilter>("all");
  const [query, setQuery] = useState("");
  const [wishQuery, setWishQuery] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const canSave = casesReady && storeConfigured;

  const rows = useMemo(() => {
    return joinOutreach(
      people.map((person) => ({
        id: person.id,
        email: person.email,
        name: person.name,
        className: person.className,
        computedCategory: person.category,
        parts: person.parts,
        hasAccount: person.user != null,
        activeSeconds: person.activeSeconds,
        lastSeenAt: person.lastSeenAt,
        lastStudyOn: person.lastStudyOn,
        staff: person.user?.staff === true,
      })),
      savedCases,
    );
  }, [people, savedCases]);

  const jobById = useMemo(
    () => new Map(rows.map((row) => [row.id, outreachJobFor(row, today)] as const)),
    [rows, today],
  );
  const openTotal = useMemo(() => [...jobById.values()].filter((job) => job != null).length, [jobById]);

  const ownedRows = useMemo(
    () => rows.filter((row) => outreachOwnerMatches(row, owner, viewerId)),
    [rows, owner, viewerId],
  );

  const doneToday = useMemo(() => {
    const byJob: Partial<Record<OutreachJobId, number>> = {};
    let total = 0;
    for (const row of ownedRows) {
      if (outreachLastSentOn(row) !== today) continue;
      total += 1;
      const job = outreachDoneTodayJob(row, today);
      if (job) byJob[job] = (byJob[job] ?? 0) + 1;
    }
    return { byJob, total };
  }, [ownedRows, today]);

  const jobs = useMemo(() => {
    const buckets = new Map<OutreachJobId, OutreachRow[]>(OUTREACH_JOBS.map((id) => [id, []]));
    for (const row of ownedRows) {
      const job = jobById.get(row.id);
      if (job && outreachMatchesQuery(row, query)) buckets.get(job)?.push(row);
    }
    return OUTREACH_JOBS.map((id) => {
      const members = buckets.get(id) ?? [];
      const overdue = id === "followup" && members.some((row) => outreachJobWhy(row, id, today).overdue);
      return { id, members, overdue };
    });
  }, [ownedRows, jobById, query, today]);

  const filtering = owner !== "all" || query.trim() !== "";
  const allMembers = jobs.flatMap((job) => job.members);
  const firstOpen = jobs.find((job) => job.members.length > 0)?.id ?? null;
  const activeId: JobPick = pickedJob ?? firstOpen ?? "all";
  const groups =
    activeId === "all"
      ? jobs.filter((job) => job.members.length > 0)
      : jobs.filter((job) => job.id === activeId && job.members.length > 0);
  const queue = groups.flatMap((group) => group.members);
  const done = activeId === "all" ? doneToday.total : (doneToday.byJob[activeId] ?? 0);
  const total = done + queue.length;
  const nextJob = jobs.find((job) => job.id !== activeId && job.members.length > 0) ?? null;

  const summary = useMemo(() => summarizeOutreach(rows), [rows]);
  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(OUTREACH_GROUPS.map((group) => [group, 0])) as Record<
      (typeof OUTREACH_GROUPS)[number],
      number
    >;
    for (const row of rows) counts[row.category] += 1;
    return counts;
  }, [rows]);

  const openRow = caseId ? (rows.find((row) => row.id === caseId) ?? null) : null;
  const openIndex = openRow ? queue.findIndex((row) => row.id === openRow.id) : -1;
  const detail = detailId ? (people.find((person) => person.user?.userId === detailId)?.user ?? null) : null;

  function pickView(next: View) {
    setView(next);
    syncUrl(next, pickedJob);
  }

  function pickJob(next: JobPick) {
    setPickedJob(next);
    syncUrl(view, next);
  }

  function remember(outreachCase: OutreachCase) {
    setSavedCases((current) => {
      const without = current.filter((item) => item.email !== outreachCase.email);
      return [...without, outreachCase];
    });
  }

  async function quickSend(row: OutreachRow, job: OutreachJobId) {
    const markSent = outreachPrimarySend(job, row.status, row.category);
    if (!row.email || markSent == null) return;
    const outreachCase = row.outreachCase;
    setBusyId(row.id);
    setQuickError(null);
    const result = await saveOutreachCase({
      email: row.email,
      greetingName: outreachCase?.greetingName ?? null,
      groupOverride: outreachCase?.groupOverride ?? null,
      status: row.status,
      followUp: outreachCase?.followUp ?? false,
      followUpOn: outreachCase?.followUpOn ?? null,
      reason: outreachCase?.reason ?? null,
      feedback: outreachCase?.feedback ?? "",
      featureRequest: outreachCase?.featureRequest ?? "",
      notes: outreachCase?.notes ?? "",
      category: row.category,
      markSent,
      clearFollowUp: false,
      claim: false,
      hadAccount: row.hasAccount,
      parts: row.parts,
    });
    setBusyId(null);
    if (!result.ok) {
      setQuickError(`${displayName(row.name, row.email)}: ${result.error}`);
      return;
    }
    remember(result.value);
  }

  const statusCount = (status: (typeof summary.statuses)[number]["status"]) =>
    summary.statuses.find((item) => item.status === status)?.count ?? 0;
  const statusTotal = summary.statuses.reduce((sum, item) => sum + item.count, 0);
  const contacted = statusTotal - statusCount("chua_gui");
  const replied = statusCount("da_tra_loi") + statusCount("da_dung");
  const wishes = summary.wishes.filter(
    (wish) =>
      !wishQuery.trim() ||
      `${wish.name} ${wish.email ?? ""} ${wish.text}`.toLowerCase().includes(wishQuery.trim().toLowerCase()),
  );

  let queueBody: ReactNode;
  if (queue.length > 0) {
    queueBody = (
      <>
        <ul data-outreach-list className="divide-y divide-admin-hairline sm:hidden">
          {groups.map((group) => (
            <Fragment key={group.id}>
              {activeId === "all" ? (
                <li className="bg-admin-canvas px-space-16 py-space-8 text-admin-label-sm uppercase text-admin-ink-subtle">
                  {OUTREACH_JOB_LABEL[group.id]} · {formatCount(group.members.length)}
                </li>
              ) : null}
              {group.members.map((row) => {
                const lastSent = outreachLastSentOn(row);
                return (
                  <li key={row.id}>
                    <div
                      data-outreach-row
                      role="button"
                      tabIndex={0}
                      aria-label={`Mở ${displayName(row.name, row.email)}`}
                      onClick={() => setCaseId(row.id)}
                      onKeyDown={(event) => rowKeyDown(event, () => setCaseId(row.id))}
                      className="flex cursor-pointer flex-col gap-space-4 px-space-16 py-space-12 outline-none focus-visible:bg-admin-cobalt-wash/50 active:bg-admin-canvas"
                    >
                      <div className="flex items-center justify-between gap-space-8">
                        <span className="flex min-w-0 items-center gap-space-8 font-semibold text-admin-ink">
                          <span className="truncate">{displayName(row.name, row.email)}</span>
                          {row.staff ? <StaffBadge /> : null}
                        </span>
                        <OwnerChip row={row} viewerId={viewerId} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-space-8 gap-y-space-4 text-admin-body-sm text-admin-ink-muted">
                        <WhyText row={row} job={group.id} today={today} />
                        {row.className?.trim() ? <span>Lớp {row.className.trim()}</span> : null}
                        {lastSent ? <span>Nhắn {outreachRelativeDay(lastSent, today)}</span> : null}
                      </div>
                      <RowActions
                        row={row}
                        job={group.id}
                        busy={busyId === row.id}
                        canSave={canSave}
                        onSend={() => void quickSend(row, group.id)}
                        className="-ml-space-12"
                      />
                    </div>
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Học viên</th>
                <th className={TH}>Lớp</th>
                <th className={TH}>Vì sao</th>
                <th className={`${TH} whitespace-nowrap`}>Nhắn lần cuối</th>
                <th className={TH}>Phụ trách</th>
                <th className={TH}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody data-outreach-list className="text-admin-body-md text-admin-ink">
              {groups.map((group) => (
                <Fragment key={group.id}>
                  {activeId === "all" ? (
                    <tr className="border-t border-admin-hairline bg-admin-canvas">
                      <th
                        colSpan={6}
                        scope="colgroup"
                        className="px-space-16 py-space-8 text-left text-admin-label-sm uppercase text-admin-ink-subtle"
                      >
                        {OUTREACH_JOB_LABEL[group.id]} · {formatCount(group.members.length)}
                      </th>
                    </tr>
                  ) : null}
                  {group.members.map((row) => {
                    const lastSent = outreachLastSentOn(row);
                    const named = row.name?.trim();
                    return (
                      <tr
                        key={row.id}
                        data-outreach-row
                        role="button"
                        tabIndex={0}
                        aria-label={`Mở ${displayName(row.name, row.email)}`}
                        onClick={() => setCaseId(row.id)}
                        onKeyDown={(event) => rowKeyDown(event, () => setCaseId(row.id))}
                        className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50`}
                      >
                        <td className="px-space-16 py-space-8">
                          <span className="flex items-center gap-space-8 font-semibold">
                            {displayName(row.name, row.email)}
                            {row.staff ? <StaffBadge /> : null}
                          </span>
                          {named && row.email ? (
                            <span className="block max-w-64 truncate text-admin-body-sm text-admin-ink-subtle">
                              {row.email}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-space-16 py-space-8">{row.className?.trim() || "—"}</td>
                        <td className="px-space-16 py-space-8">
                          <WhyText row={row} job={group.id} today={today} />
                        </td>
                        <td className="whitespace-nowrap px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
                          {lastSent ? outreachRelativeDay(lastSent, today) : "—"}
                        </td>
                        <td className="px-space-16 py-space-8">
                          <OwnerChip row={row} viewerId={viewerId} />
                        </td>
                        <td className="px-space-16 py-space-8">
                          <RowActions
                            row={row}
                            job={group.id}
                            busy={busyId === row.id}
                            canSave={canSave}
                            onSend={() => void quickSend(row, group.id)}
                            className="justify-end"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (filtering) {
    queueBody = (
      <EmptyState icon="filter_alt_off" title="Không ai khớp bộ lọc" text="Thử bỏ tìm kiếm hoặc chọn Tất cả người phụ trách.">
        <Button
          variant="secondary"
          onClick={() => {
            setQuery("");
            setOwner("all");
          }}
        >
          Xoá bộ lọc
        </Button>
      </EmptyState>
    );
  } else if (nextJob && activeId !== "all") {
    queueBody = (
      <EmptyState
        icon="check_circle"
        title={`Xong ${OUTREACH_JOB_LABEL[activeId]}`}
        text={done > 0 ? `Hôm nay đã nhắn ${formatCount(done)} người trong việc này.` : "Việc này đang trống."}
      >
        <Button variant="primary" icon="arrow_forward" onClick={() => pickJob(nextJob.id)}>
          Tiếp theo: {OUTREACH_JOB_LABEL[nextJob.id]} ({formatCount(nextJob.members.length)})
        </Button>
      </EmptyState>
    );
  } else {
    queueBody = (
      <EmptyState
        icon="task_alt"
        title="Hết việc hôm nay"
        text={
          doneToday.total > 0
            ? `Hôm nay đã nhắn ${formatCount(doneToday.total)} người. Cảm ơn bạn!`
            : "Không ai cần nhắn lúc này."
        }
      />
    );
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="People"
        title="Outreach"
        subtitle="Mỗi lần một việc. Làm hết danh sách rồi sang việc tiếp theo. Trang này không gửi tin."
        trailing={
          <Segmented
            ariaLabel="Chế độ xem"
            value={view}
            options={[
              { key: "queue", label: `Hàng đợi · ${formatCount(openTotal)}`, icon: "inbox" },
              { key: "picture", label: "Tình hình", icon: "insights" },
            ]}
            onSelect={pickView}
          />
        }
      />

      {!storeConfigured ? (
        <Notice>Cloud progress is not configured. This page only lists learners who have synced progress to Supabase.</Notice>
      ) : null}
      {storeConfigured && !pendingReady ? (
        <Notice>Pre-unlock emails are not ready yet. Run supabase/pending_level_access.sql once, then reload this page.</Notice>
      ) : null}
      {storeConfigured && !casesReady ? (
        <Notice>Outreach notes are not ready yet. Run supabase/outreach_cases.sql once, then reload this page. Messages can still be copied.</Notice>
      ) : null}

      {view === "queue" ? (
        <div className="flex flex-col gap-space-16 lg:flex-row lg:items-start">
          <nav aria-label="Việc" className="-mx-space-16 px-space-16 sm:mx-0 sm:px-0 lg:sticky lg:top-space-24 lg:w-64 lg:shrink-0">
            <ul className="flex gap-space-8 overflow-x-auto pb-space-4 lg:flex-col lg:gap-space-4 lg:overflow-visible lg:pb-0">
              <li>
                <RailItem
                  label="Tất cả việc"
                  count={allMembers.length}
                  done={doneToday.total}
                  alert={false}
                  on={activeId === "all"}
                  onClick={() => pickJob("all")}
                />
              </li>
              {jobs.map((job) => (
                <li key={job.id}>
                  <RailItem
                    label={OUTREACH_JOB_LABEL[job.id]}
                    count={job.members.length}
                    done={doneToday.byJob[job.id] ?? 0}
                    alert={job.overdue}
                    on={job.id === activeId}
                    onClick={() => pickJob(job.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 flex-1">
            <TablePanel
              icon={activeId === "followup" ? "event" : "support_agent"}
              title={activeId === "all" ? "Tất cả việc" : OUTREACH_JOB_LABEL[activeId]}
              hint={
                activeId === "all"
                  ? "Theo thứ tự làm: follow-up, hỏi thăm, tin 2, rồi tin 1."
                  : OUTREACH_JOB_HINT[activeId]
              }
              trailing={
                <span className="text-admin-body-md font-semibold tabular-nums text-admin-ink">
                  Xong {formatCount(done)}/{formatCount(total)} hôm nay
                </span>
              }
              footer="Phím tắt: J/K hoặc mũi tên để di chuyển, Enter để mở. Trong hồ sơ, J/K sang người sau hoặc trước."
            >
              <div className="flex flex-col gap-space-12 border-b border-admin-hairline px-space-16 py-space-12 sm:px-space-20">
                <div className="flex flex-col gap-space-8 sm:flex-row sm:items-center sm:justify-between">
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder="Tìm tên, email, lớp, ghi chú"
                    label="Tìm học viên"
                  />
                  <Segmented
                    ariaLabel="Người phụ trách"
                    value={owner}
                    options={OUTREACH_OWNER_FILTERS.map((key) => ({ key, label: OUTREACH_OWNER_FILTER_LABEL[key] }))}
                    onSelect={setOwner}
                  />
                </div>
                <ShareBar
                  share={total === 0 ? 0 : done / total}
                  color={ADMIN_COLORS.cobalt}
                  label="Tiến độ hôm nay"
                />
              </div>
              {quickError ? (
                <p className="border-b border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-8 text-admin-body-sm text-admin-crimson sm:px-space-20">
                  {quickError}
                </p>
              ) : null}
              {queueBody}
            </TablePanel>
          </div>
        </div>
      ) : null}

      {view === "picture" ? (
        <>
          <div className="grid gap-space-12 sm:grid-cols-3">
            <KpiTile
              icon="send"
              label="Đã nhắn"
              value={formatCount(contacted)}
              caption={`Trên ${formatCount(statusTotal)} người cần nhắn`}
              progress={statusTotal === 0 ? 0 : contacted / statusTotal}
            />
            <KpiTile
              icon="forum"
              label="Tỉ lệ trả lời"
              value={formatPercent(contacted === 0 ? 0 : replied / contacted)}
              caption={`${formatCount(replied)} người trả lời hoặc đã dùng`}
              color={ADMIN_COLORS.emerald}
            />
            <KpiTile
              icon="how_to_reg"
              label="Dùng sau khi nhắn"
              value={formatCount(statusCount("da_dung"))}
              caption="Đã đăng ký hoặc học sau tin nhắn"
              color={ADMIN_COLORS.emerald}
            />
          </div>

          <div className="grid gap-space-12 lg:grid-cols-2">
            <BarList
              title="Trạng thái"
              hint="Không tính nhóm Mới chưa nhắn."
              items={summary.statuses.map((item) => ({ label: OUTREACH_STATUS_LABEL[item.status], count: item.count }))}
              color={ADMIN_COLORS.cobalt}
              empty="Chưa có ai."
            />
            <BarList
              title="Lý do từ chối"
              items={summary.reasons
                .filter((item) => item.count > 0)
                .sort((left, right) => right.count - left.count)
                .map((item) => ({ label: OUTREACH_REASON_LABEL[item.reason], count: item.count }))}
              color={ADMIN_COLORS.crimson}
              empty="Chưa có lý do nào."
            />
            <section className={`${CARD} p-space-16 sm:p-space-20`}>
              <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">Nhóm</h2>
              <p className="mt-space-4 text-admin-body-sm text-admin-ink-muted">
                Mới là người chưa đủ 3 ngày và chưa học nhiều. Không nhắn nhóm này.
              </p>
              <ul className="mt-space-16 grid gap-space-8 sm:grid-cols-2">
                {OUTREACH_GROUPS.map((group) => (
                  <li key={group} className="flex items-center justify-between gap-space-12 text-admin-body-md">
                    <Badge tone={OUTREACH_GROUP_TONE[group]}>{OUTREACH_GROUP_LABEL[group]}</Badge>
                    <span className="tabular-nums font-semibold">{formatCount(groupCounts[group])}</span>
                  </li>
                ))}
              </ul>
            </section>
            <BarList
              title="Người phụ trách"
              items={summary.owners.map((item) => ({ label: item.name, count: item.count }))}
              color={ADMIN_COLORS.violet}
              empty="Chưa ai nhận học viên nào."
            />
          </div>

          <TablePanel
            icon="lightbulb"
            title="Yêu cầu tính năng"
            hint="Chỉ phần học viên muốn app có thêm."
            trailing={
              <SearchField value={wishQuery} onChange={setWishQuery} placeholder="Tìm yêu cầu" label="Tìm yêu cầu" />
            }
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Học viên</th>
                    <th className={TH}>Nhóm</th>
                    <th className={TH}>Yêu cầu</th>
                  </tr>
                </thead>
                <tbody className="text-admin-body-md text-admin-ink">
                  {wishes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-space-16 py-space-32 text-center text-admin-body-md text-admin-ink-muted">
                        {summary.wishes.length === 0 ? "Chưa có yêu cầu nào." : "Không có yêu cầu khớp."}
                      </td>
                    </tr>
                  ) : (
                    wishes.map((wish) => (
                      <tr key={wish.id} className={TR}>
                        <td className="px-space-16 py-space-8 font-semibold">{wish.name}</td>
                        <td className="px-space-16 py-space-8">
                          <Badge tone={OUTREACH_GROUP_TONE[wish.category]}>{OUTREACH_GROUP_LABEL[wish.category]}</Badge>
                        </td>
                        <td className="max-w-xl px-space-16 py-space-8 text-admin-body-sm">{wish.text}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TablePanel>
        </>
      ) : null}

      {openRow ? (
        <AdminOutreachCase
          key={openRow.id}
          row={openRow}
          job={jobById.get(openRow.id) ?? null}
          today={today}
          casesReady={canSave}
          position={openIndex >= 0 ? { index: openIndex, total: queue.length } : null}
          onPrev={openIndex > 0 ? () => setCaseId(queue[openIndex - 1]!.id) : null}
          onNext={openIndex >= 0 && openIndex < queue.length - 1 ? () => setCaseId(queue[openIndex + 1]!.id) : null}
          onClose={() => setCaseId(null)}
          onSaved={(outreachCase, advance) => {
            remember(outreachCase);
            if (!advance) return;
            const index = queue.findIndex((row) => row.id === openRow.id);
            const next = queue[index + 1] ?? queue[index - 1];
            setCaseId(next && next.id !== openRow.id ? next.id : null);
          }}
          onOpenStudent={
            openRow.hasAccount
              ? () => {
                  setCaseId(null);
                  setDetailId(openRow.id);
                }
              : null
          }
        />
      ) : null}

      {detail ? <StudentDetail row={detail} catalog={catalog} onClose={() => setDetailId(null)} /> : null}
    </main>
  );
}
