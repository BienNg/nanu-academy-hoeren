"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  Badge,
  Button,
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
  countOutreachCategories,
  filterOutreachPeople,
  formatAdminTimestamp,
  formatRelativeLastSeen,
  type OutreachCategory,
  type OutreachFilter,
  type OutreachPerson,
} from "@/lib/admin-overview";
import { formatActiveDuration } from "@/lib/progress";

const CATEGORY_META: Record<
  OutreachCategory,
  { label: string; short: string; tone: BadgeTone }
> = {
  preaccess: { label: "Not signed up", short: "Not signed up", tone: "violet" },
  never: { label: "No part yet", short: "No part yet", tone: "crimson" },
  light: { label: "Under 1.5 hours", short: "Under 1.5 h", tone: "amber" },
  heavy: { label: "1.5 hours or more", short: "1.5 h or more", tone: "emerald" },
};

function Notice({ children }: { children: string }) {
  return (
    <p className="rounded-admin-card border border-admin-hairline bg-admin-subtle px-space-16 py-space-12 text-admin-body-sm text-admin-ink-muted">
      {children}
    </p>
  );
}

function personName(person: OutreachPerson): string {
  if (person.category === "preaccess") return "Not signed up";
  return person.name?.trim() || person.email?.trim() || person.id;
}

export function AdminOutreach({
  people,
  catalog,
  storeConfigured,
  pendingReady,
}: {
  people: readonly OutreachPerson[];
  catalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
  pendingReady: boolean;
}) {
  const [category, setCategory] = useState<OutreachFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => countOutreachCategories(people), [people]);
  const filtered = useMemo(
    () => filterOutreachPeople(people, category, query),
    [people, category, query],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * ADMIN_PAGE_SIZE;
  const pageRows = filtered.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);
  const emails = filtered.flatMap((person) => (person.email ? [person.email] : []));
  const detail = detailId ? (people.find((person) => person.user?.userId === detailId)?.user ?? null) : null;

  function selectCategory(next: string) {
    setCategory(next as OutreachFilter);
    setPage(1);
  }

  async function copyEmails() {
    if (emails.length === 0 || !navigator.clipboard) return;
    await navigator.clipboard.writeText(emails.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="People"
        title="Outreach"
        subtitle="Four groups to hand to support. Someone who has not signed up stays on their pre-unlock email. A signed-up learner with no finished lesson part stays in that group even if they spent time in the app. Everyone else is split at 1.5 hours of active time stored over the last 120 days."
      />

      {!storeConfigured ? (
        <Notice>Cloud progress is not configured. This page only lists learners who have synced progress to Supabase.</Notice>
      ) : null}
      {storeConfigured && !pendingReady ? (
        <Notice>Pre-unlock emails are not ready yet. Run supabase/pending_level_access.sql once, then reload this page.</Notice>
      ) : null}

      <TablePanel
        icon="support_agent"
        title="People to contact"
        hint="Copy the emails in the current filter. Open a signed-up row for the full student record."
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
            label="Group"
            ariaLabel="Filter by outreach group"
            value={category}
            onSelect={selectCategory}
            options={[
              { key: "all", label: "All", count: formatCount(people.length) },
              ...(["preaccess", "never", "light", "heavy"] as const).map((key) => ({
                key,
                label: CATEGORY_META[key].short,
                count: formatCount(counts[key]),
              })),
            ]}
          />
          <label className="relative flex w-full max-w-md items-center">
            <span className="sr-only">Search by name, email, or class</span>
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
              placeholder="Search by name, email, or class"
              className={`${INPUT} pl-10`}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>Email</th>
                <th className={TH}>Class</th>
                <th className={TH}>Parts</th>
                <th className={TH}>Time</th>
                <th className={TH}>Last seen</th>
                <th className={TH}>Group</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted">
                    {people.length === 0 ? "No one to contact yet." : "No one matches this filter."}
                  </td>
                </tr>
              ) : (
                pageRows.map((person) => {
                  const openable = person.user != null;
                  const seen = formatRelativeLastSeen(person.lastSeenAt);
                  const absolute = formatAdminTimestamp(person.lastSeenAt);
                  return (
                    <tr
                      key={person.id}
                      tabIndex={openable ? 0 : undefined}
                      onClick={() => {
                        if (person.user) setDetailId(person.user.userId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && person.user) setDetailId(person.user.userId);
                      }}
                      className={`${TR} ${openable ? "cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50" : ""}`}
                    >
                      <td className="px-space-16 py-space-8">
                        <span className="flex min-w-[12rem] items-center gap-space-8">
                          <span className="font-semibold">{personName(person)}</span>
                          {person.user?.staff ? <StaffBadge /> : null}
                        </span>
                      </td>
                      <td className="px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
                        {person.email ?? "—"}
                      </td>
                      <td className="px-space-16 py-space-8">{person.className?.trim() || "—"}</td>
                      <td className="px-space-16 py-space-8 tabular-nums">
                        {person.parts == null ? "—" : formatCount(person.parts)}
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-8 tabular-nums">
                        {person.activeSeconds == null ? "—" : formatActiveDuration(person.activeSeconds)}
                      </td>
                      <td className="px-space-16 py-space-8 text-admin-body-sm">
                        {seen ? (
                          <time dateTime={person.lastSeenAt ?? undefined} title={absolute ?? undefined}>
                            {seen}
                          </time>
                        ) : (
                          <span className="text-admin-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-space-16 py-space-8">
                        <Badge tone={CATEGORY_META[person.category].tone}>
                          {CATEGORY_META[person.category].label}
                        </Badge>
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

      {detail ? (
        <StudentDetail row={detail} catalog={catalog} onClose={() => setDetailId(null)} />
      ) : null}
    </main>
  );
}
