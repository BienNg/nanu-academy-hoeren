"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  Badge,
  HeaderChip,
  Mono,
  SearchField,
  Segmented,
  TH,
  THEAD,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import type { AdminGrammarBoard, AdminGrammarGapRow } from "@/lib/admin-grammar";

/** The sentence with the blanked word marked. */
function MarkedSentence({ gap }: { gap: AdminGrammarGapRow }) {
  const tokens = gap.script.trim().split(/\s+/);
  return (
    <span>
      {tokens.map((token, index) => (
        <span key={index}>
          {index > 0 ? " " : null}
          {index === gap.index ? (
            <mark className="rounded-admin-badge bg-admin-cobalt-wash px-0.5 font-semibold text-admin-cobalt">
              {token}
            </mark>
          ) : (
            token
          )}
        </span>
      ))}
    </span>
  );
}

function matches(gap: AdminGrammarGapRow, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [gap.script, gap.translationVi, gap.word, gap.topicId ?? "", gap.labelVi].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

export function AdminGrammar({ board }: { board: AdminGrammarBoard }) {
  const [levelSlug, setLevelSlug] = useState(board.levels[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const level = board.levels.find((entry) => entry.slug === levelSlug) ?? board.levels[0];
  const totalGaps = board.topics.reduce((sum, topic) => sum + topic.gapCount, 0);
  const lessons = useMemo(
    () =>
      (level?.lessons ?? []).map((lesson) => ({
        ...lesson,
        shown: lesson.gaps.filter((gap) => matches(gap, query.trim())),
      })),
    [level, query],
  );

  return (
    <div className="flex flex-col gap-space-24">
      <AdminPageHeader
        kicker="Learning"
        title="Grammar gaps"
        subtitle="Every blank a practice deck can deal, generated from src/data/grammar and the lesson clips. Add a clip's word to noGaps to drop a gap that reads wrong, or list it in gaps to add one."
        trailing={
          <>
            <HeaderChip icon="edit_note">{formatCount(totalGaps)} gaps</HeaderChip>
            <HeaderChip icon="function">{formatCount(board.verbCount)} verbs</HeaderChip>
          </>
        }
      />

      <TablePanel
        icon="category"
        title="Topics"
        hint="From topics.json. A topic applies from its Lektion on; options are the other forms of every set holding the word."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-admin-body-sm">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Topic</th>
                <th className={TH}>From</th>
                <th className={TH}>Rules</th>
                <th className={`${TH} text-right`}>Sets</th>
                <th className={`${TH} text-right`}>Gaps</th>
              </tr>
            </thead>
            <tbody>
              {board.topics.map((topic) => (
                <tr key={topic.id} className="border-t border-admin-hairline">
                  <td className="px-space-16 py-space-12">
                    <p className="font-semibold text-admin-ink">{topic.labelVi}</p>
                    <Mono className="text-admin-ink-subtle">{topic.id}</Mono>
                  </td>
                  <td className="px-space-16 py-space-12">
                    <Mono>{topic.from}</Mono>
                  </td>
                  <td className="px-space-16 py-space-12">
                    <div className="flex flex-wrap gap-space-4">
                      <Badge tone={topic.auto ? "emerald" : "neutral"}>{topic.auto ? "auto" : "explicit only"}</Badge>
                      {topic.onlyBeforeNoun ? <Badge tone="cobalt">before noun</Badge> : null}
                    </div>
                  </td>
                  <td className="px-space-16 py-space-12 text-right tabular-nums">{formatCount(topic.setCount)}</td>
                  <td className="px-space-16 py-space-12 text-right tabular-nums">{formatCount(topic.gapCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TablePanel>

      <div className="flex flex-wrap items-center justify-between gap-space-12">
        {board.levels.length > 0 ? (
          <Segmented
            ariaLabel="Level"
            value={level?.slug ?? ""}
            options={board.levels.map((entry) => ({ key: entry.slug, label: entry.label }))}
            onSelect={setLevelSlug}
          />
        ) : null}
        <SearchField value={query} onChange={setQuery} placeholder="Word, sentence or topic" label="Filter gaps" />
      </div>

      {lessons.map((lesson) => (
        <TablePanel
          key={lesson.key}
          icon="menu_book"
          title={lesson.label}
          hint={
            lesson.topicIds.length > 0
              ? `${lesson.clipsWithGaps} of ${lesson.clipCount} clips have gaps · topics: ${lesson.topicIds.join(", ")}`
              : "No grammar topic applies yet."
          }
          trailing={<Badge tone="cobalt">{formatCount(lesson.shown.length)} gaps</Badge>}
        >
          {lesson.shown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-admin-body-sm">
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Sentence</th>
                    <th className={TH}>Topic</th>
                    <th className={TH}>Options</th>
                  </tr>
                </thead>
                <tbody>
                  {lesson.shown.map((gap) => (
                    <tr key={`${gap.clipId}:${gap.index}`} className="border-t border-admin-hairline align-top">
                      <td className="px-space-16 py-space-12">
                        <p className="text-admin-ink">
                          <MarkedSentence gap={gap} />
                        </p>
                        <p className="mt-0.5 italic text-admin-ink-subtle">{gap.translationVi}</p>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex flex-wrap gap-space-4">
                          <Badge tone="neutral">{gap.labelVi}</Badge>
                          {gap.fresh ? <Badge tone="amber">new here</Badge> : null}
                        </div>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex flex-wrap gap-space-4">
                          {gap.options.map((option, index) => (
                            <Badge key={option} tone={index === 0 ? "emerald" : "neutral"} solid={index === 0}>
                              {option}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-space-16 py-space-12 text-admin-body-sm text-admin-ink-subtle sm:px-space-20">
              {query ? "No gap matches the filter." : "No gaps in this Lektion."}
            </p>
          )}
        </TablePanel>
      ))}
    </div>
  );
}
