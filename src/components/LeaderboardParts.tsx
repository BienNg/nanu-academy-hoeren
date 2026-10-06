"use client";

import { useState } from "react";
import Image from "next/image";

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

export function PersonAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
        <Image
          src={image}
          alt=""
          width={40}
          height={40}
          referrerPolicy="no-referrer"
          className="h-10 w-10 object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold text-white"
      style={{ backgroundColor: avatarColor(name) }}
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
