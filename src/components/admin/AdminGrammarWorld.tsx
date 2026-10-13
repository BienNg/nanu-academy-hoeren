"use client";

import { Fragment, useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  CARD,
  KpiTile,
  Pager,
  SearchField,
  Segmented,
  StatusPill,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  paginate,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { ADMIN_PAGE_SIZE, formatAdminTimestamp } from "@/lib/admin-overview";
import { GRAMMAR_CARD_LABEL, type GrammarCardKind } from "@/lib/grammar-node";
import {
  GRAMMAR_WORLD_RUN_SCHEMA_HINT,
  type GrammarWorldLeftRow,
  type GrammarWorldLogStatus,
  type GrammarWorldMissRow,
  type GrammarWorldRunRow,
  type GrammarWorldTopicLabel,
} from "@/lib/grammar-world-runs";

type Person = { id: string; name: string };
type View = "finished" | "left";

function formatWhen(iso: string): string {
  return formatAdminTimestamp(iso) ?? "—";
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function stopLabel(row: { review: boolean; node: number; part: number }): string {
  return row.review ? "Review" : `Node ${row.node} · Part ${row.part}`;
}

function kindLabel(kind: string): string {
  return kind in GRAMMAR_CARD_LABEL ? GRAMMAR_CARD_LABEL[kind as GrammarCardKind] : kind;
}

function cardCaption(key: string): string {
  const parts = key.split(":");
  return parts.length >= 2 ? parts.slice(1, -1).join(" · ") || key : key;
}

function Notice({ tone, children }: { tone: "error" | "info"; children: string }) {
  return (
    <div
      className={`${CARD} flex items-start gap-space-12 border-l-2 p-space-16 ${
        tone === "error" ? "border-l-admin-crimson" : "border-l-admin-cobalt"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control ${
          tone === "error" ? "bg-admin-crimson-wash text-admin-crimson" : "bg-admin-cobalt-wash text-admin-cobalt"
        }`}
      >
        <MaterialIcon name={tone === "error" ? "error" : "info"} className="text-[18px]" />
      </div>
      <p className="pt-1 text-admin-body-md text-admin-ink">{children}</p>
    </div>
  );
}

export function AdminGrammarWorld({
  status,
  capped,
  runs,
  left,
  misses,
  people,
  topics,
}: {
  status: GrammarWorldLogStatus;
  capped: boolean;
  runs: GrammarWorldRunRow[];
  left: GrammarWorldLeftRow[];
  misses: GrammarWorldMissRow[];
  people: Person[];
  topics: GrammarWorldTopicLabel[];
}) {
  const [view, setView] = useState<View>("finished");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const names = useMemo(() => new Map(people.map((person) => [person.id, person.name])), [people]);
  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const missesByRun = useMemo(() => {
    const grouped = new Map<string, GrammarWorldMissRow[]>();
    for (const miss of misses) {
      const list = grouped.get(miss.runId) ?? [];
      list.push(miss);
      grouped.set(miss.runId, list);
    }
    for (const list of grouped.values()) list.sort((left, right) => left.position - right.position);
    return grouped;
  }, [misses]);

  const needle = query.trim().toLowerCase();
  const matches = (userId: string, topicId: string) => {
    if (!needle) return true;
    const topic = topicById.get(topicId);
    return [names.get(userId) ?? "", topic?.titleDe ?? "", topic?.titleVi ?? "", topic?.areaDe ?? "", topicId]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  };

  const finished = runs.filter((run) => matches(run.userId, run.topicId));
  const abandoned = left.filter((row) => matches(row.userId, row.topicId));
  const finishedPage = paginate(finished, page, ADMIN_PAGE_SIZE);
  const leftPage = paginate(abandoned, page, ADMIN_PAGE_SIZE);
  const paged = view === "finished" ? finishedPage : leftPage;
  const passed = runs.filter((run) => run.outcome === "success").length;
  const failed = runs.length - passed;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Learning"
        title="Grammar world"
        subtitle="Finished parts, the first wrong answer on each card, and parts a learner left before the end."
      />

      {status === "missing" ? <Notice tone="info">{GRAMMAR_WORLD_RUN_SCHEMA_HINT}</Notice> : null}
      {status === "error" ? (
        <Notice tone="error">Grammar world runs could not be loaded. Try the page again in a moment.</Notice>
      ) : null}

      <div className="grid gap-space-16 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon="flag" label="Finished" value={formatCount(runs.length)} caption="Parts that ended in this range" color={ADMIN_COLORS.cobalt} />
        <KpiTile icon="check_circle" label="Passed" value={formatCount(passed)} caption="Saved on the mountain" color={ADMIN_COLORS.emerald} />
        <KpiTile icon="heart_broken" label="Out of hearts" value={formatCount(failed)} caption="Ended without saving the part" color={ADMIN_COLORS.crimson} />
        <KpiTile icon="logout" label="Left" value={formatCount(left.length)} caption="Opened and not finished" color={ADMIN_COLORS.amber} />
      </div>

      <TablePanel
        icon="landscape"
        title={view === "finished" ? "Finished parts" : "Left early"}
        hint={
          capped
            ? "The newest 400 rows in this range. Narrow the dates to see the rest."
            : "A row opens the cards they missed and the first answer they gave."
        }
        trailing={
          <div className="flex flex-wrap items-center gap-space-8">
            <Segmented
              ariaLabel="Grammar world log"
              value={view}
              onSelect={(next) => {
                setView(next);
                setPage(1);
                setOpenId(null);
              }}
              options={[
                { key: "finished", label: "Finished" },
                { key: "left", label: "Left" },
              ]}
            />
            <SearchField
              value={query}
              onChange={(next) => {
                setQuery(next);
                setPage(1);
              }}
              placeholder="Student or stage"
              label="Search grammar world"
            />
          </div>
        }
        footer={
          <Pager
            page={paged.page}
            pageCount={paged.pageCount}
            start={paged.start}
            end={paged.end}
            total={view === "finished" ? finished.length : abandoned.length}
            noun={view === "finished" ? "parts" : "leaves"}
            onPage={setPage}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-admin-body-sm">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Student</th>
                <th className={TH}>Stage</th>
                <th className={TH}>Stop</th>
                <th className={TH}>Result</th>
                <th className={`${TH} text-right`}>{view === "finished" ? "Accuracy" : "Cards"}</th>
              </tr>
            </thead>
            <tbody>
              {(view === "finished" ? finishedPage.pageItems : leftPage.pageItems).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-space-16 py-space-24 text-admin-ink-subtle">
                    {status === "ready" ? "Nothing in this range." : "No rows to show."}
                  </td>
                </tr>
              ) : view === "finished" ? (
                finishedPage.pageItems.map((run) => {
                  const topic = topicById.get(run.topicId);
                  const open = openId === run.id;
                  const cards = missesByRun.get(run.id) ?? [];
                  return (
                    <Fragment key={run.id}>
                      <tr
                        className={`${TR} cursor-pointer`}
                        onClick={() => setOpenId(open ? null : run.id)}
                      >
                        <td className="px-space-16 py-space-12 tabular-nums text-admin-ink-subtle">{formatWhen(run.createdAt)}</td>
                        <td className="px-space-16 py-space-12 font-medium text-admin-ink">{names.get(run.userId) ?? "Unknown"}</td>
                        <td className="px-space-16 py-space-12">
                          <p className="font-medium text-admin-ink">{topic?.titleDe ?? run.topicId}</p>
                          <p className="text-admin-ink-subtle">{topic ? `${topic.areaDe} · ${topic.titleVi}` : ""}</p>
                        </td>
                        <td className="px-space-16 py-space-12 text-admin-ink">{stopLabel(run)}</td>
                        <td className="px-space-16 py-space-12">
                          <StatusPill
                            label={run.outcome === "success" ? "Passed" : "Out of hearts"}
                            tone={run.outcome === "success" ? "good" : "bad"}
                          />
                        </td>
                        <td className="px-space-16 py-space-12 text-right tabular-nums text-admin-ink">
                          {run.accuracy}%
                          <span className="mt-0.5 block text-admin-ink-subtle">{formatElapsed(run.elapsedMs)}</span>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-t border-admin-hairline bg-admin-canvas">
                          <td colSpan={6} className="px-space-16 py-space-12">
                            {cards.length === 0 ? (
                              <p className="text-admin-ink-subtle">No missed cards. Every first try was right.</p>
                            ) : (
                              <ul className="flex flex-col gap-space-8">
                                {cards.map((card) => (
                                  <li key={`${card.runId}-${card.position}`} className="flex flex-wrap items-baseline gap-x-space-12 gap-y-1">
                                    <span className="font-semibold text-admin-ink">{kindLabel(card.kind)}</span>
                                    <span className="text-admin-ink-subtle">{cardCaption(card.cardKey)}</span>
                                    <span className="text-admin-ink">{card.answer || "Missed"}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                leftPage.pageItems.map((row) => {
                  const topic = topicById.get(row.topicId);
                  return (
                    <tr key={row.id} className={TR}>
                      <td className="px-space-16 py-space-12 tabular-nums text-admin-ink-subtle">{formatWhen(row.leftAt ?? row.startedAt)}</td>
                      <td className="px-space-16 py-space-12 font-medium text-admin-ink">{names.get(row.userId) ?? "Unknown"}</td>
                      <td className="px-space-16 py-space-12">
                        <p className="font-medium text-admin-ink">{topic?.titleDe ?? row.topicId}</p>
                        <p className="text-admin-ink-subtle">{topic ? `${topic.areaDe} · ${topic.titleVi}` : ""}</p>
                      </td>
                      <td className="px-space-16 py-space-12 text-admin-ink">{stopLabel(row)}</td>
                      <td className="px-space-16 py-space-12">
                        <StatusPill label={row.leftAt ? "Left" : "Dropped"} tone="warn" />
                      </td>
                      <td className="px-space-16 py-space-12 text-right tabular-nums text-admin-ink">
                        {row.cardsDone ?? 0}/{row.cardCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TablePanel>
    </main>
  );
}
