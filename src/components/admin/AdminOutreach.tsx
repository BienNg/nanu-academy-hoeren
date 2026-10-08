"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, StaffBadge } from "@/components/admin/AdminShell";
import { AdminOutreachCase } from "@/components/admin/AdminOutreachCase";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  Badge,
  Button,
  CARD,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  type BadgeTone,
} from "@/components/admin/AdminUi";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import type { OutreachPerson } from "@/lib/admin-overview";
import {
  OUTREACH_GROUPS,
  OUTREACH_GROUP_LABEL,
  OUTREACH_JOBS,
  OUTREACH_JOB_HINT,
  OUTREACH_JOB_LABEL,
  OUTREACH_REASON_LABEL,
  joinOutreach,
  outreachJobFor,
  outreachJobWhy,
  summarizeOutreach,
  type OutreachCase,
  type OutreachGroup,
  type OutreachJobId,
  type OutreachRow,
} from "@/lib/outreach";

const GROUP_TONE: Record<OutreachGroup, BadgeTone> = {
  preaccess: "violet",
  fresh: "cobalt",
  never: "crimson",
  light: "amber",
  heavy: "emerald",
};

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

export function AdminOutreach({
  people,
  cases,
  casesReady,
  today,
  viewerId: _viewerId,
  catalog,
  storeConfigured,
  pendingReady,
}: {
  people: readonly OutreachPerson[];
  cases: readonly OutreachCase[];
  casesReady: boolean;
  today: string;
  viewerId: string;
  catalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
  pendingReady: boolean;
}) {
  const [savedCases, setSavedCases] = useState<readonly OutreachCase[]>(cases);
  const [view, setView] = useState<"today" | "picture">("today");
  const [pickedJob, setPickedJob] = useState<OutreachJobId | null>(null);
  const [cleared, setCleared] = useState<Partial<Record<OutreachJobId, number>>>({});
  const [caseId, setCaseId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

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

  const jobs = useMemo(() => {
    const buckets = new Map<OutreachJobId, OutreachRow[]>(OUTREACH_JOBS.map((id) => [id, []]));
    for (const row of rows) {
      const job = outreachJobFor(row, today);
      if (job) buckets.get(job)?.push(row);
    }
    return OUTREACH_JOBS.map((id) => ({ id, members: buckets.get(id) ?? [] }));
  }, [rows, today]);

  const firstOpen = jobs.find((job) => job.members.length > 0)?.id ?? null;
  const activeId = pickedJob ?? firstOpen;
  const active = jobs.find((job) => job.id === activeId) ?? null;
  const done = active ? (cleared[active.id] ?? 0) : 0;
  const left = active?.members.length ?? 0;
  const total = done + left;
  const nextJob = jobs.find((job) => job.id !== activeId && job.members.length > 0) ?? null;
  const summary = useMemo(() => summarizeOutreach(rows), [rows]);
  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(OUTREACH_GROUPS.map((group) => [group, 0])) as Record<OutreachGroup, number>;
    for (const row of rows) counts[row.category] += 1;
    return counts;
  }, [rows]);

  const openRow = caseId ? (rows.find((row) => row.id === caseId) ?? null) : null;
  const detail = detailId ? (people.find((person) => person.user?.userId === detailId)?.user ?? null) : null;

  function remember(outreachCase: OutreachCase) {
    setSavedCases((current) => {
      const without = current.filter((item) => item.email !== outreachCase.email);
      return [...without, outreachCase];
    });
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="People"
        title="Outreach"
        subtitle="One job at a time. Finish the list, then take the next one. Nothing is sent from here."
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

      <div className="flex gap-space-8">
        <Button variant={view === "today" ? "primary" : "secondary"} onClick={() => setView("today")}>
          Hôm nay
        </Button>
        <Button variant={view === "picture" ? "primary" : "secondary"} onClick={() => setView("picture")}>
          Tình hình
        </Button>
      </div>

      {view === "today" ? (
        <>
          <div className="grid gap-space-12 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
              const on = job.id === activeId;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setPickedJob(job.id)}
                  className={`${CARD} flex flex-col items-start gap-space-4 px-space-16 py-space-12 text-left outline-none focus-visible:shadow-admin-focus ${
                    on ? "border-admin-cobalt" : ""
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-space-8">
                    <span className="text-admin-body-md font-semibold text-admin-ink">{OUTREACH_JOB_LABEL[job.id]}</span>
                    <span className="tabular-nums text-admin-body-md font-semibold text-admin-ink">
                      {formatCount(job.members.length)}
                    </span>
                  </span>
                  {on ? <span className="text-admin-label-sm uppercase text-admin-cobalt">Làm tiếp</span> : null}
                </button>
              );
            })}
          </div>

          {active && left > 0 ? (
            <TablePanel
              icon="support_agent"
              title={OUTREACH_JOB_LABEL[active.id]}
              hint={OUTREACH_JOB_HINT[active.id]}
              trailing={
                <span className="text-admin-body-md font-semibold text-admin-ink">Còn {formatCount(left)}</span>
              }
            >
              <div className="px-space-16 py-space-12 sm:px-space-20">
                <div className="h-2 overflow-hidden rounded-full bg-admin-subtle">
                  <div
                    className="h-full rounded-full bg-admin-cobalt"
                    style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Tên</th>
                      <th className={TH}>Lớp</th>
                      <th className={TH}>Vì sao</th>
                    </tr>
                  </thead>
                  <tbody className="text-admin-body-md text-admin-ink">
                    {active.members.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Mở ${displayName(row.name, row.email)}`}
                        onClick={() => setCaseId(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") setCaseId(row.id);
                        }}
                        className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50`}
                      >
                        <td className="px-space-16 py-space-8">
                          <span className="flex items-center gap-space-8 font-semibold">
                            {displayName(row.name, row.email)}
                            {row.staff ? <StaffBadge /> : null}
                          </span>
                        </td>
                        <td className="px-space-16 py-space-8">{row.className?.trim() || "—"}</td>
                        <td className="px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
                          {outreachJobWhy(row, active.id)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TablePanel>
          ) : active && done > 0 ? (
            <div className={`${CARD} flex flex-col gap-space-12 px-space-16 py-space-20 sm:px-space-20`}>
              <p className="text-admin-body-md font-semibold text-admin-ink">
                Xong {OUTREACH_JOB_LABEL[active.id]}.
              </p>
              {nextJob ? (
                <Button variant="primary" onClick={() => setPickedJob(nextJob.id)}>
                  Tiếp theo: {OUTREACH_JOB_LABEL[nextJob.id]}
                </Button>
              ) : (
                <p className="text-admin-body-sm text-admin-ink-muted">Hết việc hôm nay.</p>
              )}
            </div>
          ) : (
            <Notice>Không có việc hôm nay.</Notice>
          )}
        </>
      ) : (
        <>
          <section className={`${CARD} p-space-16 sm:p-space-20`}>
            <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">Nhóm</h2>
            <p className="mt-space-4 text-admin-body-sm text-admin-ink-muted">
              Mới là người chưa đủ 3 ngày và chưa học nhiều. Không nhắn nhóm này.
            </p>
            <ul className="mt-space-16 grid gap-space-8 sm:grid-cols-2">
              {OUTREACH_GROUPS.map((group) => (
                <li key={group} className="flex items-center justify-between gap-space-12 text-admin-body-md">
                  <Badge tone={GROUP_TONE[group]}>{OUTREACH_GROUP_LABEL[group]}</Badge>
                  <span className="tabular-nums font-semibold">{formatCount(groupCounts[group])}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className={`${CARD} p-space-16 sm:p-space-20`}>
            <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">Lý do từ chối</h2>
            <ul className="mt-space-16 flex flex-col gap-space-8">
              {summary.reasons.map((item) => (
                <li key={item.reason} className="flex items-center justify-between gap-space-12 text-admin-body-md">
                  <span>{OUTREACH_REASON_LABEL[item.reason]}</span>
                  <span className="tabular-nums font-semibold">{formatCount(item.count)}</span>
                </li>
              ))}
            </ul>
          </section>
          <TablePanel
            icon="lightbulb"
            title="Yêu cầu tính năng"
            hint="Chỉ phần học viên muốn app có thêm."
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
                  {summary.wishes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-space-16 py-space-32 text-center text-admin-body-md text-admin-ink-muted">
                        Chưa có yêu cầu nào.
                      </td>
                    </tr>
                  ) : (
                    summary.wishes.map((wish) => (
                      <tr key={wish.id} className={TR}>
                        <td className="px-space-16 py-space-8 font-semibold">{wish.name}</td>
                        <td className="px-space-16 py-space-8">
                          <Badge tone={GROUP_TONE[wish.category]}>{OUTREACH_GROUP_LABEL[wish.category]}</Badge>
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
      )}

      {openRow ? (
        <AdminOutreachCase
          key={`${openRow.id}:${openRow.outreachCase?.updatedAt ?? ""}`}
          row={openRow}
          job={outreachJobFor(openRow, today)}
          casesReady={casesReady && storeConfigured}
          onClose={() => setCaseId(null)}
          onSaved={(outreachCase, advance) => {
            remember(outreachCase);
            if (!advance || !active) return;
            const index = active.members.findIndex((row) => row.id === openRow.id);
            const next = active.members[index + 1] ?? active.members[index - 1];
            setCleared((current) => ({ ...current, [active.id]: (current[active.id] ?? 0) + 1 }));
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
