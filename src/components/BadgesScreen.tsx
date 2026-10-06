"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { BadgeMedal, BadgeSheet, BadgeUnlockSheet, markBadgesSeenRemote, TierPips } from "@/components/BadgeParts";
import { BottomNav } from "@/components/BottomNav";
import { chunkyButton } from "@/components/chunkyButton";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  BADGE_GROUPS,
  BADGE_TIERS,
  readBadgeBoard,
  type BadgeBoardView,
  type BadgeFamilyView,
  type FreshBadge,
} from "@/lib/badges";
import { markBadgeCheck } from "@/lib/badge-unseen";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; board: BadgeBoardView }
  | { status: "unavailable" };

const SPRING = { type: "spring" as const, stiffness: 420, damping: 22 };

function formatValue(value: number): string {
  return value.toLocaleString("vi-VN");
}

function formatEarned(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

function nextTarget(family: BadgeFamilyView): number | null {
  return family.tiers.find((tier) => !tier.earnedAt)?.target ?? null;
}

function FamilyCard({
  family,
  index,
  onOpen,
}: {
  family: BadgeFamilyView;
  index: number;
  onOpen: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const next = nextTarget(family);
  const previous = family.tier > 0 ? family.tiers[family.tier - 1]!.target : 0;
  const percent =
    next == null ? 100 : Math.min(100, Math.round(((family.value - previous) / (next - previous)) * 100));
  const tierName = family.tier > 0 ? BADGE_TIERS[family.tier - 1]!.name : null;

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.04 * index }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col items-center gap-2 rounded-[22px] border-2 border-[#e5e5ea] bg-white px-3 pt-4 pb-3 text-center shadow-[0_4px_0_0_#e5e5ea] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_0_#e5e5ea]"
        aria-label={`${family.title}, ${tierName ? `cấp ${tierName}` : "chưa mở khóa"}`}
      >
        <BadgeMedal icon={family.icon} color={family.color} tier={family.tier} size={64} />
        <span className="text-[14px] leading-[18px] font-extrabold text-[#1d1d1f]">{family.title}</span>
        <TierPips tier={family.tier} />
        <span className="mt-auto flex w-full flex-col gap-1">
          <span className="relative h-2 w-full overflow-hidden rounded-full bg-[#e5e5ea]">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.max(0, percent)}%`,
                backgroundColor: next == null ? "#34C759" : "#FFC800",
              }}
            />
          </span>
          <span className="text-[11px] font-bold text-[#86868b] tabular-nums">
            {next == null ? "Đã đạt cấp cao nhất" : `${formatValue(family.value)} / ${formatValue(next)}`}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

function FamilySheet({ family, onClose }: { family: BadgeFamilyView; onClose: () => void }) {
  return (
    <BadgeSheet title={family.title} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <BadgeMedal icon={family.icon} color={family.color} tier={family.tier} size={88} />
        <p className="mt-3 text-[20px] font-extrabold text-[#1d1d1f]">{family.title}</p>
        <p className="text-[13px] font-semibold text-[#6e6e73]">
          Hiện tại: <span className="tabular-nums">{formatValue(family.value)}</span>
        </p>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {family.tiers.map((tier) => {
          const style = BADGE_TIERS[tier.tier - 1]!;
          const earned = tier.earnedAt != null;
          return (
            <li
              key={tier.id}
              className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 ${
                earned ? "border-transparent" : "border-[#f2f2f7]"
              }`}
              style={earned ? { backgroundColor: `${style.glow}80` } : undefined}
            >
              <BadgeMedal icon={family.icon} color={family.color} tier={earned ? tier.tier : 0} size={40} />
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[13px] font-extrabold" style={{ color: earned ? style.lip : "#86868b" }}>
                  {style.name}
                </p>
                <p className="text-[14px] leading-5 font-bold text-[#1d1d1f]">{tier.goal}</p>
              </div>
              <span className="shrink-0 text-right text-[11px] font-bold text-[#86868b]">
                {earned && tier.earnedAt ? (
                  formatEarned(tier.earnedAt)
                ) : (
                  <span className="tabular-nums">
                    {formatValue(Math.min(family.value, tier.target))}/{formatValue(tier.target)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onClose} className={chunkyButton("secondary", "mt-5 w-full")}>
        Đóng
      </button>
    </BadgeSheet>
  );
}

function Hero({ board }: { board: BadgeBoardView | null }) {
  const reduceMotion = useReducedMotion() ?? false;
  const earned = board?.earned ?? 0;
  const total = board?.total ?? 0;
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#5856D6] to-[#0071E3] p-4 text-white shadow-[0_6px_0_0_#3634a3]">
      <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-wider text-white/85 uppercase">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          workspace_premium
        </span>
        Bộ sưu tập
      </span>
      <p className="mt-1 text-[28px] leading-8 font-extrabold tabular-nums">
        {earned}
        <span className="text-[18px] text-white/75"> / {total || "—"} huy hiệu</span>
      </p>
      <p className="mt-1 text-[13px] font-semibold text-white/85">
        Học đều, giữ chuỗi và leo bảng xếp hạng để mở khóa cấp Đồng, Bạc, Vàng và Kim cương.
      </p>
      <div
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/25"
        role="progressbar"
        aria-valuenow={earned}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${earned} / ${total} huy hiệu`}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[#FFC800]"
          initial={reduceMotion ? false : { width: "0%" }}
          animate={{ width: `${percent}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </section>
  );
}

export function BadgesScreen() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<FreshBadge[]>([]);

  const load = useCallback(() => {
    void fetch("/api/badges")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const board = readBadgeBoard(data);
        // This screen shows its own unlocks, so the nav need not ask again soon.
        markBadgeCheck();
        setState(board ? { status: "ready", board } : { status: "unavailable" });
        if (board && board.fresh.length > 0) setFresh(board.fresh);
      })
      .catch(() => setState({ status: "unavailable" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const finishUnlock = useCallback((ids: string[]) => {
    setFresh([]);
    markBadgesSeenRemote(ids);
  }, []);

  const board = state.status === "ready" ? state.board : null;
  const open = board?.families.find((family) => family.id === openId) ?? null;

  return (
    <div className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff] text-[#131b2e]">
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 pt-3 pb-2.5">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href="/leaderboard"
              aria-label="Về bảng xếp hạng"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#131b2e] hover:bg-black/[0.04]"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                arrow_back_ios_new
              </span>
            </Link>
            <h1 className="truncate font-headline-md text-headline-md font-extrabold tracking-tight">Huy hiệu</h1>
          </div>
          <TopBarStatus />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <Hero board={board} />

        {state.status === "loading" ? (
          <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-[22px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
            ))}
          </div>
        ) : null}

        {state.status === "unavailable" ? (
          <section className="flex flex-col items-center gap-3 rounded-[24px] border-2 border-[#e5e5ea] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#e5e5ea]">
            <BadgeMedal icon="workspace_premium" color="#5856D6" tier={0} size={64} />
            <p className="text-[15px] font-extrabold text-[#1d1d1f]">Chưa tải được huy hiệu</p>
            <p className="text-[13px] font-semibold text-[#6e6e73]">Kiểm tra kết nối mạng rồi thử lại nhé.</p>
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                load();
              }}
              className={chunkyButton("secondary", "mt-1 w-full")}
            >
              Thử lại
            </button>
          </section>
        ) : null}

        {board
          ? BADGE_GROUPS.map((group) => {
              const families = board.families.filter((family) => family.group === group.id);
              if (families.length === 0) return null;
              const earned = families.reduce((sum, family) => sum + family.tier, 0);
              return (
                <section key={group.id} aria-labelledby={`badge-group-${group.id}`} className="flex flex-col gap-3">
                  <div className="flex items-end justify-between px-1">
                    <h2 id={`badge-group-${group.id}`} className="text-[18px] font-extrabold text-[#1d1d1f]">
                      {group.title}
                    </h2>
                    <span className="text-[13px] font-bold text-[#6e6e73] tabular-nums">
                      {earned} / {families.length * BADGE_TIERS.length}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3">
                    {families.map((family, index) => (
                      <FamilyCard
                        key={family.id}
                        family={family}
                        index={index}
                        onOpen={() => setOpenId(family.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          : null}

        {board ? (
          <p className="px-2 text-center text-[12px] font-semibold text-[#86868b]">
            Huy hiệu tuần được trao sau khi tuần kết thúc (0 giờ thứ Hai, giờ Việt Nam).
          </p>
        ) : null}
      </main>

      <AnimatePresence>
        {open ? <FamilySheet key={open.id} family={open} onClose={() => setOpenId(null)} /> : null}
      </AnimatePresence>
      <AnimatePresence>
        {fresh.length > 0 ? (
          <BadgeUnlockSheet key="unlock" badges={fresh} onDone={finishUnlock} showCollectionLink={false} />
        ) : null}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
