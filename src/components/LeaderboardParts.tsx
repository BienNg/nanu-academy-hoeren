"use client";

import { useState } from "react";
import Image from "next/image";
import { shortWeekday } from "@/lib/xp";

const AVATAR_COLORS = ["#0284c7", "#0369a1", "#0f766e", "#b45309", "#7c3aed", "#be123c"];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 1)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0]!;
}

function initialFor(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?";
}

export function PersonAvatar({
  name,
  image,
  size = 40,
}: {
  name: string;
  image: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (image && !failed) {
    return (
      <span className="relative shrink-0 overflow-hidden rounded-full" style={box}>
        <Image
          src={image}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="h-full w-full rounded-full object-cover"
          style={box}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white"
      style={{ ...box, fontSize: Math.round(size * 0.4), backgroundColor: avatarColor(name) }}
      aria-hidden="true"
    >
      {initialFor(name)}
    </span>
  );
}

export function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) {
    return <span className="w-8 text-center text-[15px] font-bold text-[#94a3b8]">–</span>;
  }
  if (rank > 3) {
    return (
      <span className="w-8 text-center text-[15px] font-extrabold tabular-nums text-[#6e7881]">
        {rank}
      </span>
    );
  }
  const tone =
    rank === 1
      ? "bg-[#ffc800] text-[#7a4b00] shadow-[0_3px_0_0_#e0a800]"
      : rank === 2
        ? "bg-[#e8eef5] text-[#3e4850] shadow-[0_3px_0_0_#c5d0dc]"
        : "bg-[#f0b27a] text-[#6b3e12] shadow-[0_3px_0_0_#d4894a]";
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-extrabold tabular-nums ${tone}`}
    >
      {rank}
    </span>
  );
}

type DailyXpPoint = { day: string; xp: number };

function axisMax(peak: number): number {
  if (peak <= 0) return 40;
  const pow = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 4, 5, 8, 10]) {
    const candidate = step * pow;
    if (candidate > peak) return candidate;
  }
  return pow * 10;
}

function formatCount(value: number): string {
  return value.toLocaleString("vi-VN");
}

function ChartLegend({
  color,
  hollow,
  name,
  total,
}: {
  color: string;
  hollow?: boolean;
  name: string;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-[#4b4b4b]">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${hollow ? "border-2 bg-white" : ""}`}
          style={hollow ? { borderColor: color } : { backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="truncate">{name}</span>
      </span>
      <span className="shrink-0 text-[15px] font-extrabold tabular-nums" style={{ color }}>
        {formatCount(total)} XP
      </span>
    </div>
  );
}

export function XpWeekCompareChart({
  themName,
  themDays,
  youDays,
}: {
  themName: string | null;
  themDays: DailyXpPoint[] | null;
  youDays: DailyXpPoint[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const themByDay = new Map((themDays ?? []).map((point) => [point.day, point.xp]));
  const points = youDays.map((point) => ({
    day: point.day,
    you: point.xp,
    them: themDays ? (themByDay.get(point.day) ?? 0) : null,
    label: shortWeekday(point.day),
  }));
  const youTotal = points.reduce((sum, point) => sum + point.you, 0);
  const themTotal = themDays ? points.reduce((sum, point) => sum + (point.them ?? 0), 0) : 0;
  const max = axisMax(Math.max(0, ...points.flatMap((point) => (point.them == null ? [point.you] : [point.you, point.them]))));
  const ticks = [max, max / 2, 0];
  const width = 360;
  const height = 168;
  const left = 30;
  const right = 8;
  const top = 16;
  const bottom = 22;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const plotted = points.map((point, index) => {
    const x = left + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
    const yFor = (xp: number) => top + plotH - (xp / max) * plotH;
    return { ...point, x, youY: yFor(point.you), themY: point.them == null ? null : yFor(point.them) };
  });
  const line = (key: "youY" | "themY") =>
    plotted
      .map((point, index) => {
        const y = point[key];
        if (y == null) return "";
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  const column = plotW / plotted.length;
  const youColor = themName ? "#afafaf" : "#1cb0f6";

  return (
    <div className="rounded-2xl border-2 border-[#e5e5e5] bg-white px-4 pt-4 pb-3">
      <h2 className="text-[17px] leading-6 font-extrabold tracking-tight text-[#3c3c3c]">XP tuần này</h2>
      <div className="mt-3 flex flex-col gap-1.5">
        {themName && themDays ? (
          <ChartLegend color="#1cb0f6" name={themName} total={themTotal} />
        ) : null}
        <ChartLegend color={youColor} hollow={Boolean(themName)} name="Bạn" total={youTotal} />
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 block w-full"
        role="img"
        aria-label={
          themName
            ? `XP 7 ngày: ${themName} ${formatCount(themTotal)} XP, bạn ${formatCount(youTotal)} XP`
            : `XP 7 ngày của bạn, tổng ${formatCount(youTotal)} XP`
        }
      >
        {ticks.map((tick) => {
          const y = top + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#efefef" strokeWidth="1" />
              <text x={left - 6} y={y + 3} textAnchor="end" fill="#afafaf" fontSize="11" fontWeight="700">
                {formatCount(tick)}
              </text>
            </g>
          );
        })}
        <path d={line("youY")} fill="none" stroke={themName ? "#d5d5d5" : "#8ed4ff"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {themName ? (
          <path d={line("themY")} fill="none" stroke="#8ed4ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {plotted.map((point, index) => {
          const selected = active === index;
          return (
            <g key={point.day} className="cursor-pointer" onClick={() => setActive(selected ? null : index)}>
              <rect x={point.x - column / 2} y={top} width={column} height={plotH} fill="transparent">
                <title>
                  {point.them == null
                    ? `${point.label} ${formatCount(point.you)} XP`
                    : `${point.label}: ${themName} ${formatCount(point.them)} XP, bạn ${formatCount(point.you)} XP`}
                </title>
              </rect>
              <circle
                cx={point.x}
                cy={point.youY}
                r={selected ? 4 : 3.2}
                fill={themName ? "#fff" : youColor}
                stroke={themName ? "#afafaf" : "none"}
                strokeWidth={themName ? 1.6 : 0}
              />
              {point.themY != null ? <circle cx={point.x} cy={point.themY} r={selected ? 4 : 3.2} fill="#1cb0f6" /> : null}
              <text x={point.x} y={height - 4} textAnchor="middle" fill="#afafaf" fontSize="11" fontWeight="700">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
