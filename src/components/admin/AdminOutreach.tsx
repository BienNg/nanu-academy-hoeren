"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import { AdminOutreachCase } from "@/components/admin/AdminOutreachCase";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  Badge,
  Button,
  CARD,
  INPUT,
  Pager,
  ScopeChips,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  type BadgeTone,
} from "@/components/admin/AdminUi";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  ADMIN_PAGE_SIZE,
  formatAdminTimestamp,
  formatRelativeLastSeen,
  type OutreachPerson,
} from "@/lib/admin-overview";
import { formatActiveDuration } from "@/lib/progress";
import {
  OUTREACH_GROUPS,
  OUTREACH_GROUP_LABEL,
  OUTREACH_QUEUES,
  OUTREACH_QUEUE_LABEL,
  OUTREACH_REASON_LABEL,
  OUTREACH_STATUS_LABEL,
  filterOutreachRows,
  joinOutreach,
  summarizeOutreach,
  type OutreachCase,
  type OutreachGroup,
  type OutreachQueue,
  type OutreachStatus,
} from "@/lib/outreach";

const GROUP_TONE: Record<OutreachGroup, BadgeTone> = {
  preaccess: "violet",
  never: "crimson",
  light: "amber",
  heavy: "emerald",
};

const STATUS_TONE: Record<OutreachStatus, BadgeTone> = {
  chua_gui: "neutral",
  da_gui_tin_1: "cobalt",
  da_gui_tin_2: "violet",
  da_tra_loi: "emerald",
  khong_tra_loi: "crimson",
  da_dung: "amber",
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
  viewerId,
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
  const [category, setCategory] = useState<OutreachGroup | "all">("all");
  const [queue, setQueue] = useState<OutreachQueue>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        staff: person.user?.staff === true,
      })),
      savedCases,
    );
  }, [people, savedCases]);

  const filtered = useMemo(
    () => filterOutreachRows(rows, { category, queue, query, viewerId, today }),
    [rows, category, queue, query, viewerId, today],
  );
  const summary = useMemo(() => summarizeOutreach(rows), [rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * ADMIN_PAGE_SIZE;
  const pageRows = filtered.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);
  const emails = filtered.flatMap((row) => (row.email ? [row.email] : []));
  const openRow = caseId ? (rows.find((row) => row.id === caseId) ?? null) : null;
  const detail = detailId ? (people.find((person) => person.user?.userId === detailId)?.user ?? null) : null;

  function selectCategory(next: string) {
    setCategory(next as OutreachGroup | "all");
    setPage(1);
  }

  function selectQueue(next: string) {
    setQueue(next as OutreachQueue);
    setPage(1);
  }

  async function copyEmails() {
    if (emails.length === 0 || !navigator.clipboard) return;
    await navigator.clipboard.writeText(emails.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function queueCount(key: OutreachQueue): number {
    return filterOutreachRows(rows, { category, queue: key, query: "", viewerId, today }).length;
  }

  function groupCount(key: OutreachGroup | "all"): number {
    return filterOutreachRows(rows, { category: key, queue, query: "", viewerId, today }).length;
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="People"
        title="Outreach"
        subtitle="Support copies a message and sends it by hand. The group comes from the app. Open a row to copy the text, mark it sent, and record the reply."
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

      <TablePanel
        icon="support_agent"
        title="People to contact"
        hint="Open a row for the message, the reply, and the follow-up. Copy emails for the current filter."
        trailing={
          <Button
            variant="secondary"
            icon={copied ? "check" : "content_copy"}
            disabled={emails.length === 0}
            onClick={() => void copyEmails()}
          >
            {copied ? "Copied" : `Copy ${formatCount(emails.length)} ${emails.length === 1 ? "email" : "emails"}`}
          </Button>
        }
      >
        <div className="flex flex-col gap-space-12 border-b border-admin-hairline px-space-16 py-space-12 sm:px-space-20">
          <ScopeChips
            label="Nhóm"
            ariaLabel="Lọc theo nhóm"
            value={category}
            onSelect={selectCategory}
            options={[
              { key: "all", label: "Tất cả", count: formatCount(groupCount("all")) },
              ...OUTREACH_GROUPS.map((key) => ({
                key,
                label: OUTREACH_GROUP_LABEL[key],
                count: formatCount(groupCount(key)),
              })),
            ]}
          />
          <ScopeChips
            label="Việc"
            icon="inbox"
            ariaLabel="Lọc theo việc cần làm"
            value={queue}
            onSelect={selectQueue}
            options={OUTREACH_QUEUES.map((key) => ({
              key,
              label: OUTREACH_QUEUE_LABEL[key],
              count: formatCount(queueCount(key)),
            }))}
          />
          <label className="relative flex w-full max-w-md items-center">
            <span className="sr-only">Tìm theo tên, email, lớp, hoặc phản hồi</span>
            <MaterialIcon
              name="search"
              className="pointer-events-none absolute left-space-12 text-[18px] text-admin-ink-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tên, email, lớp, phản hồi"
              className={`${INPUT} pl-10`}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Tên</th>
                <th className={TH}>Email</th>
                <th className={TH}>Lớp</th>
                <th className={TH}>Bài tập</th>
                <th className={TH}>Thời gian</th>
                <th className={TH}>Lần cuối</th>
                <th className={TH}>Nhóm</th>
                <th className={TH}>Trạng thái</th>
                <th className={TH}>Follow-up</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted">
                    {rows.length === 0 ? "Chưa có ai để nhắn." : "Không có ai khớp bộ lọc."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const seen = formatRelativeLastSeen(row.lastSeenAt);
                  const absolute = formatAdminTimestamp(row.lastSeenAt);
                  const followUp = row.outreachCase?.followUp ? row.outreachCase.followUpOn : null;
                  return (
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
                        <span className="flex min-w-[12rem] items-center gap-space-8">
                          <span className="font-semibold">{displayName(row.name, row.email)}</span>
                          {row.staff ? <StaffBadge /> : null}
                          {row.conversionHint ? <Badge tone="emerald">Đã dùng?</Badge> : null}
                        </span>
                      </td>
                      <td className="px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
                        {row.email ?? "—"}
                      </td>
                      <td className="px-space-16 py-space-8">{row.className?.trim() || "—"}</td>
                      <td className="px-space-16 py-space-8 tabular-nums">
                        {row.parts == null ? "—" : formatCount(row.parts)}
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-8 tabular-nums">
                        {row.activeSeconds == null ? "—" : formatActiveDuration(row.activeSeconds)}
                      </td>
                      <td className="px-space-16 py-space-8 text-admin-body-sm">
                        {seen ? (
                          <time dateTime={row.lastSeenAt ?? undefined} title={absolute ?? undefined}>
                            {seen}
                          </time>
                        ) : (
                          <span className="text-admin-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-space-16 py-space-8">
                        <Badge tone={GROUP_TONE[row.category]}>{OUTREACH_GROUP_LABEL[row.category]}</Badge>
                      </td>
                      <td className="px-space-16 py-space-8">
                        <Badge tone={STATUS_TONE[row.status]}>{OUTREACH_STATUS_LABEL[row.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-8 text-admin-body-sm">
                        {followUp ? (
                          <time dateTime={followUp} className={followUp <= today ? "font-semibold text-admin-amber-ink" : ""}>
                            {followUp}
                          </time>
                        ) : (
                          <span className="text-admin-ink-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-admin-hairline px-space-16 py-space-12 sm:px-space-20">
          <Pager
            page={safePage}
            pageCount={pageCount}
            start={filtered.length === 0 ? 0 : startIndex + 1}
            end={Math.min(startIndex + ADMIN_PAGE_SIZE, filtered.length)}
            total={filtered.length}
            noun="people"
            onPage={setPage}
          />
        </div>
      </TablePanel>

      <div className={`${CARD} p-space-16 sm:p-space-20`}>
        <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">Lý do từ chối</h2>
        <p className="mt-space-4 text-admin-body-sm text-admin-ink-muted">Cả chiến dịch, kể cả người đang bị lọc khỏi bảng.</p>
        <ul className="mt-space-16 flex flex-col gap-space-8">
          {summary.reasons.map((item) => (
            <li key={item.reason} className="flex items-center justify-between gap-space-12 text-admin-body-md">
              <span>{OUTREACH_REASON_LABEL[item.reason]}</span>
              <span className="tabular-nums font-semibold">{formatCount(item.count)}</span>
            </li>
          ))}
        </ul>
      </div>

      <TablePanel
        icon="lightbulb"
        title="Yêu cầu tính năng"
        hint="Chỉ phần học viên muốn app có thêm. Đọc nguyên văn để gom ý giống nhau."
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
                  <tr
                    key={wish.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Mở ${wish.name}`}
                    onClick={() => setCaseId(wish.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setCaseId(wish.id);
                    }}
                    className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50`}
                  >
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

      {openRow ? (
        <AdminOutreachCase
          key={`${openRow.id}:${openRow.outreachCase?.updatedAt ?? ""}`}
          row={openRow}
          casesReady={casesReady && storeConfigured}
          onClose={() => setCaseId(null)}
          onSaved={(outreachCase) => {
            setSavedCases((current) => {
              const without = current.filter((item) => item.email !== outreachCase.email);
              return [...without, outreachCase];
            });
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

      {detail ? (
        <StudentDetail row={detail} catalog={catalog} onClose={() => setDetailId(null)} />
      ) : null}
    </main>
  );
}
