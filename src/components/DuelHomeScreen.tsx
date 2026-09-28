"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  DUEL_DEADLINE_DAYS,
  DUEL_EXPIRE_CHALLENGER_XP,
  DUEL_SCHEMA_HINT,
  DUEL_SIZE,
  challengeLeftLabel,
  type DuelCard,
  type DuelHome,
  type MatchBlock,
} from "@/lib/duels";

function isDuelHome(value: unknown): value is DuelHome {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DuelHome>;
  return typeof record.ready === "boolean" && Array.isArray(record.history);
}

function challengeAgeLabel(iso: string, now = new Date()): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const vietnam = 7 * 60 * 60 * 1000;
  const dayIndex = (ms: number) => Math.floor((ms + vietnam) / 86_400_000);
  const days = dayIndex(now.getTime()) - dayIndex(at);
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return `${days} ngày trước`;
}

function withDeadline(card: DuelCard, progress: string): string {
  const left = challengeLeftLabel(
    card.expiresAt,
    new Date(),
    card.youSettled >= DUEL_SIZE ? "opponent" : "you",
  );
  return left ? `${progress} · ${left}` : progress;
}

function needsMoreStudy(home: DuelHome): boolean {
  return home.ready && !home.viewerIsAdmin && home.studiedCount < DUEL_SIZE;
}

function blockMessage(home: DuelHome): string | null {
  if (!home.ready) {
    return home.viewerIsAdmin
      ? DUEL_SCHEMA_HINT
      : "Đấu sẽ mở khi giáo viên bật tính năng này.";
  }
  if (needsMoreStudy(home)) return null;
  if (home.block === "no_class") {
    return "Bạn chưa có lớp. Nhờ giáo viên thêm bạn vào lớp để đấu với bạn học.";
  }
  if (home.block === "no_overlap") {
    return "Chưa có bạn cùng lớp nào đã học ít nhất 15 câu giống bạn. Hãy học thêm để mở đấu.";
  }
  if (home.block === "admin") return "Tài khoản giáo viên không tham gia đấu.";
  if (home.block === "unavailable") return "Chưa thể tìm đối thủ lúc này. Hãy thử lại sau.";
  return null;
}

function DuelCardLink({ card, action }: { card: DuelCard; action: string }) {
  const waiting = card.youSettled >= DUEL_SIZE && !card.opponentStarted;
  const detail = withDeadline(
    card,
    card.youSettled >= DUEL_SIZE
      ? waiting
        ? "Đối thủ chưa bắt đầu"
        : "Đối thủ đang chơi"
      : card.youSettled > 0
        ? `Câu ${card.youSettled + 1}/${DUEL_SIZE}`
        : card.challenged
          ? "Bạn chưa chơi"
          : "Sẵn sàng chơi",
  );
  const title = card.challenged ? `${card.opponentName} thách đấu bạn` : `vs ${card.opponentName}`;

  return (
    <Link
      href={`/duel/${card.id}`}
      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#dae2fd] transition-transform active:translate-y-0.5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e0f2fe] text-[#0284c7]">
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
          swords
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold text-[#131b2e]">{title}</span>
        <span className="mt-0.5 block text-[13px] font-semibold text-[#6e7881]">{detail}</span>
      </span>
      <span className="shrink-0 rounded-full bg-[#0284c7] px-3 py-1.5 text-[12px] font-extrabold text-white shadow-[0_2px_0_0_#0369a1]">
        {action}
      </span>
    </Link>
  );
}

function nameInitial(name: string | null | undefined): string {
  const label = name?.trim() || "?";
  return Array.from(label)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function MatchupSide({
  name,
  points,
  winner,
}: {
  name: string;
  points: number | null;
  winner: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl text-[16px] font-extrabold ${
          winner
            ? "bg-[#0284c7] text-white shadow-[0_3px_0_0_#0369a1]"
            : "bg-[#e0f2fe] text-[#0284c7]"
        }`}
      >
        {nameInitial(name)}
      </span>
      <span
        className={`mt-1 w-full truncate text-[14px] font-extrabold ${
          winner ? "text-[#0284c7]" : "text-[#131b2e]"
        }`}
      >
        {name}
      </span>
      <span
        className={`mt-1 text-[32px] font-extrabold leading-none tabular-nums ${
          winner ? "text-[#0284c7]" : "text-[#131b2e]"
        }`}
      >
        {points ?? "–"}
      </span>
      <span
        className={`mt-1 text-[11px] font-extrabold uppercase tracking-wide ${
          winner ? "text-[#0284c7]" : "invisible"
        }`}
        aria-hidden={winner ? undefined : true}
      >
        Thắng
      </span>
    </div>
  );
}

function MatchupCard({ card, action }: { card: DuelCard; action: string }) {
  const yourName = card.yourName || "Bạn";
  const opponentName = card.opponentName || "Học viên";
  const waiting = card.youSettled >= DUEL_SIZE && !card.opponentStarted;
  const finished = card.yourOutcome != null || card.expired;
  const age = challengeAgeLabel(card.createdAt);
  const note = finished
    ? card.expired
      ? age
        ? `Hết hạn · ${age}`
        : "Hết hạn"
      : card.yourOutcome === "tie"
        ? age
          ? `Hòa · ${age}`
          : "Hòa"
        : age
    : withDeadline(card, waiting ? `${opponentName} chưa bắt đầu` : `${opponentName} đang chơi`);

  return (
    <Link
      href={`/duel/${card.id}`}
      className="block rounded-[28px] bg-white px-4 py-4 shadow-[0_3px_0_0_#dae2fd] transition-transform active:translate-y-0.5"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <MatchupSide name={yourName} points={card.yourPoints} winner={card.yourOutcome === "win"} />
        <span className="pb-5 text-[12px] font-extrabold tracking-wide text-[#94a3b8]">VS</span>
        <MatchupSide name={opponentName} points={card.opponentPoints} winner={card.yourOutcome === "loss"} />
      </div>
      <div className="mt-2 flex flex-col items-center gap-2">
        {note ? (
          <span className="text-center text-[13px] font-semibold text-[#6e7881]">{note}</span>
        ) : null}
        <span className="rounded-full bg-[#0284c7] px-4 py-1.5 text-[12px] font-extrabold text-white shadow-[0_2px_0_0_#0369a1]">
          {action}
        </span>
      </div>
    </Link>
  );
}

function Section({
  title,
  cards,
  action,
  matchup = false,
}: {
  title: string;
  cards: DuelCard[];
  action: string;
  matchup?: boolean;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-[#6e7881]">{title}</h2>
      {cards.map((card) =>
        matchup ? (
          <MatchupCard key={card.id} card={card} action={action} />
        ) : (
          <DuelCardLink key={card.id} card={card} action={action} />
        ),
      )}
    </section>
  );
}

export function DuelHomeScreen({ initial }: { initial: DuelHome }) {
  const router = useRouter();
  const [home, setHome] = useState(initial);
  const [starting, setStarting] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/duels")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!cancelled && isDuelHome(data)) setHome(data);
      })
      .catch(() => {
        // Keep the page that was rendered on the server.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const explanation = notice ?? blockMessage(home);
  const studyFirst = needsMoreStudy(home);
  const canStart = home.ready && home.block === "ok" && !starting && !studyFirst;
  const capped = home.ready && home.block === "cap" && !studyFirst;

  const start = async () => {
    if (capped) {
      setCapOpen(true);
      return;
    }
    if (!canStart) return;
    setStarting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/duels", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; id?: string; block?: MatchBlock };
      if (data.ok && typeof data.id === "string") {
        router.push(`/duel/${data.id}`);
        return;
      }
      if (data.block === "cap") setCapOpen(true);
      else if (data.block) {
        setHome((current) => ({ ...current, block: data.block ?? current.block }));
      }
    } catch {
      setNotice("Không tạo được trận đấu. Hãy thử lại.");
    } finally {
      setStarting(false);
    }
  };

  const empty =
    home.incoming.length + home.playing.length + home.waiting.length + home.history.length === 0;

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1 className="min-w-0 truncate font-headline-md text-headline-md font-extrabold tracking-tight">
            Đấu
          </h1>
          <TopBarStatus />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">Đấu với bạn cùng lớp</p>
            {studyFirst ? (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20"
                aria-hidden="true"
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  lock
                </span>
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[22px] font-extrabold leading-tight">15 câu giống nhau. Ai nhanh hơn được điểm.</p>
          <p className="mt-2 text-[13px] font-semibold text-sky-50">
            {studyFirst
              ? `Đã khóa · Bạn đã học ${home.studiedCount}/${DUEL_SIZE} câu.`
              : `Bạn đã học ${home.studiedCount} câu. Thắng 50 XP, hòa 35 XP, thua 20 XP. Hết ${DUEL_DEADLINE_DAYS} ngày không chơi thì người thách được ${DUEL_EXPIRE_CHALLENGER_XP} XP.`}
          </p>
          {studyFirst ? (
            <Link
              href={home.studyHref ?? "/"}
              className="relative z-10 mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-center text-[16px] font-extrabold leading-tight text-[#0284c7] shadow-[0_4px_0_0_#bae6fd] transition-transform active:translate-y-0.5 active:shadow-[0_2px_0_0_#bae6fd] sm:text-[17px]"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                menu_book
              </span>
              Học thêm {Math.max(0, DUEL_SIZE - home.studiedCount)} câu để mở đấu
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!canStart && !capped}
              className={`relative z-10 mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-extrabold transition-transform ${
                canStart
                  ? "bg-white text-[#0284c7] shadow-[0_4px_0_0_#bae6fd] active:translate-y-0.5 active:shadow-[0_2px_0_0_#bae6fd]"
                  : capped
                    ? "bg-white/40 text-white"
                    : "cursor-not-allowed bg-white/25 text-white/80"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                swords
              </span>
              {starting ? "Đang tìm đối thủ..." : "Đấu mới"}
            </button>
          )}
          <span
            className="pointer-events-none absolute -right-3 -bottom-6 text-white/15 material-symbols-outlined text-[120px]"
            aria-hidden="true"
          >
            swords
          </span>
        </section>

        {explanation ? (
          <p className="rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold leading-relaxed text-[#3e4850] shadow-[0_3px_0_0_#dae2fd]">
            {explanation}
          </p>
        ) : null}

        <Section title="Chưa chơi" cards={home.incoming} action="Chơi" />
        <Section title="Đang đấu" cards={home.playing} action="Tiếp tục" />
        <Section title="Đang chờ" cards={home.waiting} action="Xem" matchup />
        <Section title="Đã xong" cards={home.history} action="Xem lại" matchup />

        {empty && home.ready && home.block === "ok" ? (
          <p className="px-2 text-center text-[14px] font-semibold text-[#6e7881]">
            Hãy bắt đầu trận đầu tiên với một bạn cùng lớp.
          </p>
        ) : null}
      </main>

      {capOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#131b2e]/40 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="duel-cap-title"
            className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_8px_0_0_#dae2fd]"
          >
            <h2 id="duel-cap-title" className="text-[18px] font-extrabold text-[#131b2e]">
              Chưa thể đấu mới
            </h2>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-[#3e4850]">
              Mỗi bạn cùng lớp chỉ có tối đa 3 trận đang mở. Tất cả bạn phù hợp đều đã đủ 3 trận, nên bạn chưa thể đấu mới.
            </p>
            <button
              type="button"
              onClick={() => setCapOpen(false)}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#0284c7] text-[16px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-0.5 active:shadow-none"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      ) : null}
      <BottomNav />
    </div>
  );
}
