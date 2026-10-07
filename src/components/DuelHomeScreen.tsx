"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";
import { ChillPingu } from "@/components/session/Pingu";
import { chunkyButton } from "@/components/chunkyButton";
import {
  DUEL_DEADLINE_DAYS,
  DUEL_LOSS_XP,
  DUEL_SCHEMA_HINT,
  DUEL_SIZE,
  DUEL_TIE_XP,
  DUEL_WIN_XP,
  MAX_OPEN_WITH_CLASSMATE,
  challengeLeftLabel,
  completedAgoLabel,
  duelHomeFocus,
  timeLeftPhrase,
  type DuelCard,
  type DuelEndPose,
  type DuelFocus,
  type DuelHome,
  type MatchBlock,
} from "@/lib/duels";

const HISTORY_PREVIEW = 3;

const HERO_BUTTON =
  "relative z-10 mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[15px] font-extrabold uppercase tracking-[0.08em] text-[#0284c7] shadow-[0_4px_0_0_#bae6fd] transition-[translate,box-shadow] duration-100 select-none active:translate-y-[4px] active:shadow-none";

const HERO_BUTTON_OFF =
  "relative z-10 mt-4 flex h-[52px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-white/25 px-4 text-[15px] font-extrabold uppercase tracking-[0.08em] text-white/85 select-none";

function isDuelHome(value: unknown): value is DuelHome {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DuelHome>;
  return typeof record.ready === "boolean" && Array.isArray(record.history);
}

function withDeadline(card: DuelCard, progress: string): string {
  const left = challengeLeftLabel(
    card.expiresAt,
    new Date(),
    card.youSettled >= DUEL_SIZE ? "opponent" : "you",
  );
  return left ? `${progress} · ${left}` : progress;
}

function blockMessage(home: DuelHome): string {
  if (!home.ready) {
    return home.viewerIsAdmin ? DUEL_SCHEMA_HINT : "Đấu sẽ mở khi giáo viên bật tính năng này.";
  }
  if (home.block === "admin" || home.viewerIsAdmin) return "Tài khoản giáo viên không tham gia đấu.";
  if (home.block === "no_class") {
    return "Bạn chưa có lớp. Nhờ giáo viên thêm bạn vào lớp để đấu với bạn học.";
  }
  if (home.block === "no_overlap") {
    return "Chưa có bạn cùng lớp nào đã học ít nhất 15 câu giống bạn. Hãy học thêm để mở đấu.";
  }
  return "Chưa thể tìm đối thủ lúc này. Hãy thử lại sau.";
}

function DuelCardLink({ card, action, detail }: { card: DuelCard; action: string; detail: string }) {
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

function incomingDetail(card: DuelCard): string {
  return withDeadline(card, card.youSettled > 0 ? `Câu ${card.youSettled + 1}/${DUEL_SIZE}` : "Bạn chưa chơi");
}

function playingDetail(card: DuelCard): string {
  return withDeadline(card, `Câu ${card.youSettled + 1}/${DUEL_SIZE}`);
}

function waitingDetail(card: DuelCard): string {
  const left = timeLeftPhrase(card.expiresAt, new Date());
  const prize = `Thắng +${DUEL_WIN_XP} XP`;
  return left ? `Còn ${left} · ${prize}` : prize;
}

function nameInitial(name: string | null | undefined): string {
  const label = name?.trim() || "?";
  return Array.from(label)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function WinnerCrown({ visible }: { visible: boolean }) {
  return (
    <span
      className={`mb-1 flex h-4 items-end justify-center ${visible ? "text-[#f5b400]" : "invisible"}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 16" className="h-4 w-6" fill="currentColor">
        <path d="M2 14h20L20.2 6.2 16 9.4 12 2.4 8 9.4 3.8 6.2 2 14z" />
        <circle cx="3.6" cy="5.2" r="1.5" />
        <circle cx="12" cy="2.2" r="1.5" />
        <circle cx="20.4" cy="5.2" r="1.5" />
      </svg>
    </span>
  );
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
      <WinnerCrown visible={winner} />
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
    </div>
  );
}

function outcomeLabel(card: Pick<DuelCard, "expired" | "yourOutcome">): string {
  if (card.expired) return "Hết hạn";
  if (card.yourOutcome === "win") return "Thắng";
  if (card.yourOutcome === "loss") return "Thua";
  return "Hòa";
}

function MatchupCard({ card }: { card: DuelCard }) {
  const yourName = card.yourName || "Bạn";
  const opponentName = card.opponentName || "Học viên";
  const age = completedAgoLabel(card.createdAt);
  const xp = card.yourXp ?? 0;

  if (card.expired) {
    const detail = [outcomeLabel(card), age, xp > 0 ? `+${xp} XP` : null].filter(Boolean).join(" · ");
    return <DuelCardLink card={{ ...card, challenged: false }} action="Xem lại" detail={detail} />;
  }

  return (
    <Link
      href={`/duel/${card.id}`}
      className="block rounded-[28px] bg-white px-4 py-4 shadow-[0_3px_0_0_#dae2fd] transition-transform active:translate-y-0.5"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <MatchupSide name={yourName} points={card.yourPoints} winner={card.yourOutcome === "win"} />
        <span className="flex flex-col items-center gap-1">
          {age ? <span className="text-center text-[11px] font-bold leading-none text-[#6e7881]">{age}</span> : null}
          <span className="text-[12px] font-extrabold tracking-wide text-[#94a3b8]">VS</span>
        </span>
        <MatchupSide name={opponentName} points={card.opponentPoints} winner={card.yourOutcome === "loss"} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-extrabold">
        <span className="text-[#6e7881]">{outcomeLabel(card)}</span>
        {xp > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-[#f59e0b]">
            <span
              className="material-symbols-outlined text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              bolt
            </span>
            +{xp} XP
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-[#6e7881]">{title}</h2>
      {children}
    </section>
  );
}

type HeroContent = {
  label: string;
  headline: string;
  note: string | null;
  pill: string | null;
  pose: DuelEndPose;
};

function heroContent(focus: DuelFocus, home: DuelHome): HeroContent {
  if (focus.kind === "incoming") {
    return {
      label: "Lời thách đấu",
      headline: `${focus.card.opponentName} thách đấu bạn`,
      note: `Cùng ${DUEL_SIZE} câu. Ai nhanh hơn ở mỗi câu được 1 điểm.`,
      pill: challengeLeftLabel(focus.card.expiresAt, new Date(), "you"),
      pose: "pickleball",
    };
  }
  if (focus.kind === "playing") {
    return {
      label: "Đang đấu",
      headline: `Câu ${focus.card.youSettled + 1}/${DUEL_SIZE} với ${focus.card.opponentName}`,
      note: "Chơi tiếp những câu còn lại.",
      pill: challengeLeftLabel(focus.card.expiresAt, new Date(), "you"),
      pose: "pingpong",
    };
  }
  if (focus.kind === "study") {
    const left = Math.max(0, DUEL_SIZE - home.studiedCount);
    return {
      label: "Đấu với bạn cùng lớp",
      headline: `Học thêm ${left} câu để mở đấu`,
      note: `Bạn đã học ${home.studiedCount}/${DUEL_SIZE} câu. Trận đấu dùng những câu bạn đã học.`,
      pill: null,
      pose: "pen",
    };
  }
  if (focus.kind === "intro") {
    return {
      label: "Đấu với bạn cùng lớp",
      headline: "Thách một bạn cùng lớp",
      note: null,
      pill: null,
      pose: "cups",
    };
  }
  if (focus.kind === "start") {
    return {
      label: "Đấu với bạn cùng lớp",
      headline: "Sẵn sàng cho trận mới?",
      note: `Thắng +${DUEL_WIN_XP} XP · Thua vẫn được +${DUEL_LOSS_XP} XP`,
      pill: null,
      pose: "pingpong",
    };
  }
  if (focus.kind === "cap") {
    return {
      label: "Đấu với bạn cùng lớp",
      headline: `Đủ ${MAX_OPEN_WITH_CLASSMATE} trận đang mở`,
      note: `Mỗi bạn cùng lớp có tối đa ${MAX_OPEN_WITH_CLASSMATE} trận đang mở. Chờ các bạn chơi xong rồi đấu tiếp.`,
      pill: null,
      pose: "tea",
    };
  }
  return {
    label: "Đấu với bạn cùng lớp",
    headline: "Chưa thể đấu",
    note: blockMessage(home),
    pill: null,
    pose: "peekaboo",
  };
}

function Hero({
  focus,
  home,
  starting,
  onStart,
}: {
  focus: DuelFocus;
  home: DuelHome;
  starting: boolean;
  onStart: () => void;
}) {
  const content = heroContent(focus, home);
  const action =
    focus.kind === "incoming" ? (
      <Link href={`/duel/${focus.card.id}`} className={HERO_BUTTON}>
        Chơi ngay
      </Link>
    ) : focus.kind === "playing" ? (
      <Link href={`/duel/${focus.card.id}`} className={HERO_BUTTON}>
        Tiếp tục
      </Link>
    ) : focus.kind === "study" ? (
      <Link href={home.studyHref ?? "/"} className={HERO_BUTTON}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          menu_book
        </span>
        Học ngay
      </Link>
    ) : focus.kind === "intro" || focus.kind === "start" ? (
      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className={starting ? HERO_BUTTON_OFF : HERO_BUTTON}
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          swords
        </span>
        {starting ? "Đang tìm đối thủ..." : focus.kind === "intro" ? "Đấu ngay" : "Đấu mới"}
      </button>
    ) : focus.kind === "cap" ? (
      <button type="button" disabled className={HERO_BUTTON_OFF}>
        Đủ {MAX_OPEN_WITH_CLASSMATE} trận đang mở
      </button>
    ) : null;

  return (
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-4 text-white shadow-[0_6px_0_0_#0369a1]">
      <div className="relative z-10 flex min-h-[100px] flex-col gap-1 pr-[118px]">
        <span className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            swords
          </span>
          {content.label}
        </span>
        <p className="text-[19px] font-extrabold leading-6">{content.headline}</p>
        {content.note ? (
          <p className="text-[13px] font-semibold leading-snug text-sky-50">{content.note}</p>
        ) : null}
        {content.pill ? (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 text-[12px] font-extrabold">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              schedule
            </span>
            {content.pill}
          </span>
        ) : null}
      </div>
      <div className="pointer-events-none absolute top-3 right-3 origin-top-right scale-[1.25]" aria-hidden="true">
        <ChillPingu pose={content.pose} />
      </div>
      {action}
    </section>
  );
}

const HOW_IT_WORKS = [
  {
    title: `Cùng ${DUEL_SIZE} câu`,
    body: "Câu hỏi lấy từ những câu cả hai bạn đã học.",
  },
  {
    title: "Nhanh hơn được điểm",
    body: "Mỗi câu, ai làm đúng nhanh hơn được 1 điểm.",
  },
  {
    title: "Chơi lúc nào cũng được",
    body: `Bạn chơi trước. Bạn kia có ${DUEL_DEADLINE_DAYS} ngày để chơi phần của họ.`,
  },
  {
    title: "Thua vẫn được XP",
    body: `Thắng +${DUEL_WIN_XP} · Hòa +${DUEL_TIE_XP} · Thua +${DUEL_LOSS_XP} XP.`,
  },
] as const;

function HowItWorks() {
  return (
    <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_3px_0_0_#dae2fd]">
      <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#6e7881]">Cách chơi</h2>
      <ol className="mt-3 flex flex-col gap-3">
        {HOW_IT_WORKS.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e0f2fe] text-[14px] font-extrabold text-[#0284c7]">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold text-[#131b2e]">{step.title}</span>
              <span className="block text-[13px] font-semibold leading-snug text-[#6e7881]">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordStrip({ home }: { home: DuelHome }) {
  const record = home.record ?? { wins: 0, losses: 0, ties: 0 };
  if (record.wins + record.losses + record.ties === 0) return null;
  const cells = [
    { label: "Thắng", value: record.wins, tone: "text-[#0284c7]" },
    { label: "Hòa", value: record.ties, tone: "text-[#131b2e]" },
    { label: "Thua", value: record.losses, tone: "text-[#131b2e]" },
  ];
  return (
    <section className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#dae2fd]">
      <div className="grid grid-cols-3 divide-x divide-[#e2e7ff]">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col items-center gap-0.5">
            <span className={`text-[24px] font-extrabold leading-none tabular-nums ${cell.tone}`}>{cell.value}</span>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#6e7881]">{cell.label}</span>
          </div>
        ))}
      </div>
      <Link
        href="/leaderboard"
        className="mt-3 flex items-center justify-center gap-1 border-t border-[#e2e7ff] pt-2.5 text-[13px] font-extrabold text-[#0284c7]"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          leaderboard
        </span>
        Xem bảng xếp hạng
      </Link>
    </section>
  );
}

export function DuelHomeScreen({ initial }: { initial: DuelHome }) {
  const router = useRouter();
  const [home, setHome] = useState(initial);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [allHistory, setAllHistory] = useState(false);

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

  const focus = duelHomeFocus(home);
  const canStart = home.ready && home.block === "ok" && home.studiedCount >= DUEL_SIZE && !home.viewerIsAdmin;

  const start = async () => {
    if (!canStart || starting) return;
    setStarting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/duels", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; id?: string; block?: MatchBlock };
      if (data.ok && typeof data.id === "string") {
        router.push(`/duel/${data.id}`);
        return;
      }
      if (data.block) {
        setHome((current) => ({ ...current, block: data.block ?? current.block }));
      } else {
        setNotice("Không tạo được trận đấu. Hãy thử lại.");
      }
    } catch {
      setNotice("Không tạo được trận đấu. Hãy thử lại.");
    } finally {
      setStarting(false);
    }
  };

  const focusedId = focus.kind === "incoming" || focus.kind === "playing" ? focus.card.id : null;
  const incoming = home.incoming.filter((card) => card.id !== focusedId);
  const playing = home.playing.filter((card) => card.id !== focusedId);
  const history = allHistory ? home.history : home.history.slice(0, HISTORY_PREVIEW);
  const hasLists = incoming.length + playing.length + home.waiting.length + home.history.length > 0;
  const startAlso = focusedId != null && canStart;

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

      <main
        className={`mx-auto w-full flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 ${
          hasLists
            ? "flex max-w-4xl flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6"
            : "flex max-w-xl flex-col gap-4"
        }`}
      >
        <div className="flex flex-col gap-4 md:sticky md:top-20">
          <Hero focus={focus} home={home} starting={starting} onStart={() => void start()} />
          {startAlso ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className={chunkyButton(starting ? "disabled" : "secondary", "w-full")}
            >
              {starting ? "Đang tìm đối thủ..." : "Đấu mới"}
            </button>
          ) : null}
          {notice ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold leading-relaxed text-[#3e4850] shadow-[0_3px_0_0_#dae2fd]">
              {notice}
            </p>
          ) : null}
          {focus.kind === "intro" ? <HowItWorks /> : null}
          <RecordStrip home={home} />
        </div>

        {hasLists ? (
          <div className="flex flex-col gap-4">
            {incoming.length > 0 ? (
              <Section title="Chưa chơi">
                {incoming.map((card) => (
                  <DuelCardLink key={card.id} card={card} action="Chơi" detail={incomingDetail(card)} />
                ))}
              </Section>
            ) : null}
            {playing.length > 0 ? (
              <Section title="Đang đấu">
                {playing.map((card) => (
                  <DuelCardLink key={card.id} card={card} action="Tiếp tục" detail={playingDetail(card)} />
                ))}
              </Section>
            ) : null}
            {home.waiting.length > 0 ? (
              <Section title="Đang chờ">
                {home.waiting.map((card) => (
                  <DuelCardLink key={card.id} card={card} action="Xem" detail={waitingDetail(card)} />
                ))}
              </Section>
            ) : null}
            {home.history.length > 0 ? (
              <Section title="Đã xong">
                {history.map((card) => (
                  <MatchupCard key={card.id} card={card} />
                ))}
                {home.history.length > HISTORY_PREVIEW ? (
                  <button
                    type="button"
                    onClick={() => setAllHistory((open) => !open)}
                    className="flex h-11 items-center justify-center rounded-2xl text-[14px] font-extrabold text-[#0284c7]"
                  >
                    {allHistory ? "Thu gọn" : `Xem tất cả (${home.history.length})`}
                  </button>
                ) : null}
              </Section>
            ) : null}
          </div>
        ) : null}
      </main>

      <BottomNav />
    </div>
  );
}
