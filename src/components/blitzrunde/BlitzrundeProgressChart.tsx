"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProgressRound, ProgressSeries } from "@/lib/blitzrunde";

/** Reference categorical order (validated set), assigned by name so a colour follows the student. */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const MAX_COLORED = SERIES_COLORS.length;
const CONTEXT_STROKE = "#c3cdf2";
const YOU_STROKE = "#0284c7";

export type ProgressChartProps = {
  rounds: ProgressRound[];
  series: ProgressSeries[];
  names: Record<string, string>;
  /** Student view: this line is emphasised, the rest are grey context. */
  youId?: string | null;
  variant: "student" | "admin";
  height?: number;
};

type Row = { index: number; tick: string; lektion: string; date: string } & Record<string, number | string | null>;

function shortLektion(label: string): string {
  const match = /Lektion\s*(\d+)/i.exec(label);
  return match ? `L${match[1]}` : label;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "numeric" });
}

function formatPoints(value: number): string {
  return value.toLocaleString("vi-VN");
}

function ProgressTooltip({
  active,
  payload,
  names,
  youId,
  highlight,
}: {
  active?: boolean;
  payload?: readonly { payload?: Row }[];
  names: Record<string, string>;
  youId?: string | null;
  highlight?: string | null;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const values = Object.keys(names)
    .map((id) => ({ id, value: row[id] }))
    .filter((entry): entry is { id: string; value: number } => typeof entry.value === "number")
    .sort((left, right) => right.value - left.value);
  const focus = youId ?? highlight ?? null;
  const shown = focus ? values.filter((entry, index) => index < 3 || entry.id === focus) : values.slice(0, 8);
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
      <p className="font-extrabold text-[#131b2e]">{row.lektion}</p>
      <p className="mb-1 text-[#6e7881]">{row.date}</p>
      <ul className="flex flex-col gap-0.5">
        {shown.map((entry) => {
          const rank = values.findIndex((candidate) => candidate.id === entry.id) + 1;
          const mine = entry.id === focus;
          return (
            <li key={entry.id} className={`flex justify-between gap-4 ${mine ? "font-extrabold text-[#0284c7]" : "text-[#3e4850]"}`}>
              <span>
                {rank}. {entry.id === youId ? "Bạn" : names[entry.id]}
              </span>
              <span className="tabular-nums">{formatPoints(entry.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Running Blitzrunde totals per student, one line each, rounds in date order
 * (ticks show the Lektion). A line starts at a student's first round in the
 * class and stops when they have left it.
 */
export function BlitzrundeProgressChart({ rounds, series, names, youId, variant, height = 240 }: ProgressChartProps) {
  const [highlight, setHighlight] = useState<string | null>(null);

  const data = useMemo<Row[]>(
    () =>
      rounds.map((round, index) => {
        const row: Row = {
          index,
          tick: shortLektion(round.lektionLabel),
          lektion: round.lektionLabel,
          date: formatDate(round.playedAt),
        };
        for (const line of series) row[line.userId] = line.totals[index] ?? null;
        return row;
      }),
    [rounds, series],
  );

  // Colour follows the student (alphabetical), never their current rank.
  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    if (variant !== "admin" || series.length > MAX_COLORED) return map;
    [...series]
      .sort((left, right) => (names[left.userId] ?? "").localeCompare(names[right.userId] ?? "", "vi"))
      .forEach((line, index) => map.set(line.userId, SERIES_COLORS[index] ?? CONTEXT_STROKE));
    return map;
  }, [series, names, variant]);

  const focus = variant === "student" ? (youId ?? null) : highlight;
  const ordered = [...series].sort((left, right) => {
    if (left.userId === focus) return 1;
    if (right.userId === focus) return -1;
    return 0;
  });

  const strokeFor = (id: string): string => {
    if (variant === "student") return id === youId ? YOU_STROKE : CONTEXT_STROKE;
    if (highlight) return id === highlight ? (colorById.get(id) ?? YOU_STROKE) : CONTEXT_STROKE;
    return colorById.get(id) ?? CONTEXT_STROKE;
  };

  const axis = variant === "student" ? "#94a3b8" : "#717785";
  const grid = variant === "student" ? "#e4e8f6" : "#c1c6d6";

  return (
    <div className="flex flex-col gap-3">
      <div style={{ height }} className="blitz-chart-in w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="tick"
              tick={{ fill: axis, fontSize: 11, fontWeight: 700 }}
              tickLine={false}
              axisLine={{ stroke: grid }}
              interval="preserveStartEnd"
            />
            <YAxis
              width={44}
              tick={{ fill: axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value))}
            />
            <Tooltip
              cursor={{ stroke: axis, strokeDasharray: "3 3" }}
              content={<ProgressTooltip names={names} youId={variant === "student" ? youId : null} highlight={highlight} />}
            />
            {ordered.map((line) => {
              const emphasised = line.userId === focus || (variant === "admin" && !highlight && colorById.size > 0);
              return (
                <Line
                  key={line.userId}
                  type="monotone"
                  dataKey={line.userId}
                  name={names[line.userId] ?? ""}
                  stroke={strokeFor(line.userId)}
                  strokeWidth={line.userId === focus ? 3 : emphasised ? 2 : 1.5}
                  dot={line.userId === focus ? { r: 4, strokeWidth: 2, fill: "#fff" } : false}
                  activeDot={line.userId === focus || emphasised ? { r: 5 } : false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {variant === "student" ? (
        <div className="flex items-center gap-4 px-1 text-[12px] font-bold text-[#6e7881]">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-5 rounded-full" style={{ backgroundColor: YOU_STROKE }} aria-hidden="true" />
            Bạn
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-5 rounded-full" style={{ backgroundColor: CONTEXT_STROKE }} aria-hidden="true" />
            Bạn cùng lớp
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {[...series]
            .sort((left, right) => right.total - left.total)
            .map((line) => {
              const color = colorById.get(line.userId) ?? YOU_STROKE;
              const active = highlight === line.userId;
              return (
                <button
                  key={line.userId}
                  type="button"
                  onClick={() => setHighlight((current) => (current === line.userId ? null : line.userId))}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-caption text-caption transition-colors ${
                    active
                      ? "border-primary bg-primary-fixed text-on-primary-fixed"
                      : "border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorById.size > 0 || active ? color : CONTEXT_STROKE }}
                    aria-hidden="true"
                  />
                  <span className="text-on-surface">{names[line.userId]}</span>
                  <span className="tabular-nums">{formatPoints(line.total)}</span>
                  {!line.member ? <span className="italic">(left)</span> : null}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
