"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { deleteOwnAccount } from "@/app/account/actions";
import { BadgeMedal, BadgeSheet } from "@/components/BadgeParts";
import { FamilySheet } from "@/components/BadgesScreen";
import { readEarnedFamilies, type BadgeFamilyView } from "@/lib/badges";
import { BottomNav } from "@/components/BottomNav";
import { chunkyButton } from "@/components/chunkyButton";
import { RecapShareButton } from "@/components/RecapShareButton";
import { leaderboardDisplayName, parseDisplayName } from "@/lib/xp";
import { discardDeviceProgress, rememberClientDevice, useProgress } from "@/lib/useProgress";

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

type AccountScreenProps = {
  callbackUrl: string;
  isAdmin?: boolean;
};

function matchesDeletePhrase(value: string): boolean {
  const folded = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return folded === "xoa";
}

function DeleteAccountDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [phrase, setPhrase] = useState("");
  const confirmed = matchesDeletePhrase(phrase);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:items-center">
      <button
        type="button"
        aria-label="Đóng"
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-body"
        className="relative flex w-full max-w-md flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,0.18)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmed || busy) return;
          onConfirm();
        }}
      >
        <div className="flex flex-col gap-2">
          <h2
            id="delete-account-title"
            className="text-[20px] font-bold tracking-tight text-[#1d1d1f]"
          >
            Xóa tài khoản vĩnh viễn?
          </h2>
          <p id="delete-account-body" className="text-[14px] font-medium leading-relaxed text-[#86868b]">
            Toàn bộ tiến độ, điểm XP, huy hiệu và lịch sử học sẽ bị xóa khỏi máy chủ.
            Không thể khôi phục. Sau đó bạn có thể đăng nhập lại và bắt đầu từ đầu.
          </p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-[#1d1d1f]">
            Nhập XÓA để xác nhận
          </span>
          <input
            autoFocus
            value={phrase}
            disabled={busy}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Nhập XÓA để xác nhận"
            placeholder="XÓA"
            onChange={(event) => setPhrase(event.target.value)}
            className="h-12 rounded-[14px] border border-black/10 bg-[#f5f5f7] px-4 text-[16px] font-semibold text-[#1d1d1f] outline-none focus:border-[#ff3b30]"
          />
        </label>
        {error ? (
          <p className="text-[13px] font-medium text-[#ff3b30]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={!confirmed || busy}
            className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-[#ff3b30] text-[15px] font-semibold text-white transition-opacity enabled:active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Đang xóa…" : "Xóa vĩnh viễn"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-[#f5f5f7] text-[15px] font-semibold text-[#1d1d1f] enabled:active:scale-[0.98] disabled:opacity-40"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}

type ProfileSnapshot = {
  name: string;
  className: string | null;
  classXp: number;
  classSize: number;
  weekRank: number | null;
  totalXp: number;
  top3: number;
  badges: BadgeFamilyView[];
};

function readProfile(value: unknown): ProfileSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.ready !== true) return null;
  const badges = readEarnedFamilies(raw.badges);
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    className: typeof raw.className === "string" && raw.className.length > 0 ? raw.className : null,
    classXp: typeof raw.classXp === "number" ? raw.classXp : 0,
    classSize: typeof raw.classSize === "number" ? raw.classSize : 0,
    weekRank: typeof raw.weekRank === "number" ? raw.weekRank : null,
    totalXp: typeof raw.totalXp === "number" ? raw.totalXp : 0,
    top3: typeof raw.top3 === "number" ? raw.top3 : 0,
    badges,
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("vi-VN");
}

function FireIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <path d="M16 3c1 5 6 7 6 13a6 6 0 0 1-12 0c0-2 1-3 1-5 2 1 3 2 3 4 2-3 1-8 2-12Z" fill="#FF9600" />
      <path d="M16 13c.6 2.4 3 3.4 3 6.4a3 3 0 0 1-6 0c0-1 .6-1.6.6-2.6 1 .5 1.6 1 1.6 2 .8-1.6.4-4 .8-5.8Z" fill="#FFC800" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <path d="M18 3 7 18h8l-2 11 12-16h-8l1-10Z" fill="#FFC800" stroke="#E6A800" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function GemIcon({ rank }: { rank: number | null }) {
  const fill = rank === 1 ? "#FFC800" : rank === 2 ? "#C5CED9" : rank === 3 ? "#FF4B4B" : "#1CB0F6";
  const lip = rank === 1 ? "#E6A800" : rank === 2 ? "#8E9AAB" : rank === 3 ? "#D43636" : "#1899D6";
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <path d="M8 12 16 4l8 8-8 16L8 12Z" fill={lip} />
      <path d="M8 12h16L16 4 8 12Z" fill={fill} />
      <path d="M8 12 16 28 16 12 8 12Z" fill="#fff" opacity="0.28" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <circle cx="16" cy="18" r="9" fill="#FFC800" />
      <circle cx="16" cy="18" r="6" fill="#FFE08A" />
      <path d="M12 6h3l1 6h-4L12 6Zm5 0h3l-1 6h-4l2-6Z" fill="#FF4B4B" />
      <path d="M16 14.5 17.1 17h2.6l-2.1 1.6.8 2.5L16 19.6 13.6 21l.8-2.5L12.3 17h2.6L16 14.5Z" fill="#E6A800" />
    </svg>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-h-[88px] items-center gap-2.5 rounded-2xl border-2 border-[#e5e5e5] bg-white px-3 py-3">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-[22px] leading-6 font-extrabold text-[#3c3c3c] tabular-nums">{value}</p>
        <p className="text-[13px] leading-4 font-bold text-[#afafaf]">{label}</p>
      </div>
    </div>
  );
}

function LearnerProfile({
  image,
  email,
  isAdmin,
  onSignOut,
  onDelete,
}: {
  image: string | null | undefined;
  email: string | null | undefined;
  isAdmin: boolean;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const { streakDays } = useProgress();
  const [photoFailed, setPhotoFailed] = useState(false);
  const [profile, setProfile] = useState<ProfileSnapshot | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openBadgeId, setOpenBadgeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!cancelled) setProfile(readProfile(data));
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shownName = leaderboardDisplayName(profile?.name);
  const showPhoto = Boolean(image) && !photoFailed;
  const openBadge = profile?.badges.find((badge) => badge.id === openBadgeId) ?? null;

  async function saveName() {
    if (saving) return;
    const parsed = parseDisplayName(draft);
    if (!parsed) {
      setNameError("Tên cần từ 2 đến 30 chữ, không chứa ký tự đặc biệt.");
      return;
    }
    setSaving(true);
    setNameError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Không lưu được tên. Thử lại sau một lúc.";
        setNameError(message);
        setSaving(false);
        return;
      }
      const saved =
        data && typeof data === "object" && typeof (data as { name?: unknown }).name === "string"
          ? (data as { name: string }).name
          : parsed;
      setProfile((current) =>
        current
          ? { ...current, name: saved }
          : {
              name: saved,
              className: null,
              classXp: 0,
              classSize: 0,
              weekRank: null,
              totalXp: 0,
              top3: 0,
              badges: [],
            },
      );
      setEditing(false);
    } catch {
      setNameError("Không lưu được tên. Thử lại sau một lúc.");
    }
    setSaving(false);
  }

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col overflow-x-hidden bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-end px-4 md:max-w-3xl">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#1cb0f6] active:bg-[#ddf4ff]"
            aria-label="Cài đặt"
          >
            <MaterialIcon name="settings" className="text-[26px]" />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:max-w-3xl">
        <section className="flex flex-col items-center text-center">
          <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-[#ddf4ff] shadow-[0_4px_0_#e5e5e5] ring-2 ring-[#e5e5e5]">
            {showPhoto && image ? (
              <Image
                src={image}
                alt=""
                width={112}
                height={112}
                priority
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <img src="/nav/profile.svg" alt="" className="h-full w-full object-cover" />
            )}
          </div>

          {editing ? (
            <form
              className="mt-4 flex w-full flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
            >
              <label className="flex flex-col gap-1 text-left">
                <span className="text-[13px] font-extrabold tracking-wide text-[#afafaf] uppercase">Tên hiển thị</span>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={30}
                  autoFocus
                  autoComplete="nickname"
                  className="h-12 rounded-2xl border-2 border-[#e5e5e5] bg-white px-4 text-center text-[18px] font-extrabold text-[#3c3c3c] outline-none focus:border-[#1cb0f6]"
                />
              </label>
              {nameError ? (
                <p className="text-[13px] font-bold text-[#ff4b4b]" role="alert">
                  {nameError}
                </p>
              ) : (
                <p className="text-[13px] font-bold text-[#afafaf]">Tên này hiện trên bảng xếp hạng.</p>
              )}
              <button type="submit" disabled={saving} className={chunkyButton(saving ? "disabled" : "primary", "w-full")}>
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setNameError(null);
                }}
                className={chunkyButton("secondary", "w-full")}
              >
                Hủy
              </button>
            </form>
          ) : profile === undefined ? (
            <div className="mt-3 h-8 w-40 animate-pulse rounded-full bg-[#e2e7ff]" />
          ) : (
            <div className="mt-3 flex max-w-full items-center justify-center gap-1">
              <h1 className="truncate text-[26px] leading-8 font-extrabold tracking-tight text-[#3c3c3c]">{shownName}</h1>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#1cb0f6] active:bg-[#ddf4ff]"
                aria-label="Sửa tên"
                onClick={() => {
                  setDraft(profile?.name ?? "");
                  setNameError(null);
                  setEditing(true);
                }}
              >
                <MaterialIcon name="edit" className="text-[20px]" />
              </button>
            </div>
          )}
          {email && !editing ? <p className="mt-1 max-w-full truncate text-[14px] font-bold text-[#afafaf]">{email}</p> : null}
        </section>

        <section>
          <h2 className="mb-3 text-[22px] leading-7 font-extrabold tracking-tight">Thống kê</h2>
          <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
            <StatCard icon={<FireIcon />} value={String(streakDays)} label="Chuỗi ngày" />
            <StatCard icon={<BoltIcon />} value={profile ? formatCount(profile.totalXp) : "—"} label="Tổng XP" />
            <div className="relative">
              {profile?.weekRank != null ? (
                <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-md bg-[#ff4b4b] px-1.5 py-0.5 text-[10px] leading-none font-extrabold tracking-wide text-white">
                  TUẦN NÀY
                </span>
              ) : null}
              <StatCard
                icon={<GemIcon rank={profile?.weekRank ?? null} />}
                value={profile?.weekRank != null ? String(profile.weekRank) : "—"}
                label="Hạng lớp"
              />
            </div>
            <StatCard icon={<MedalIcon />} value={profile ? formatCount(profile.top3) : "—"} label="Lần top 3" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[22px] leading-7 font-extrabold tracking-tight">Lớp của bạn</h2>
          {profile === undefined ? (
            <div className="h-36 animate-pulse rounded-2xl bg-[#e2e7ff]" />
          ) : profile?.className ? (
            <div className="rounded-2xl border-2 border-[#e5e5e5] bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ddf4ff]">
                  <img src="/nav/learn.svg" alt="" className="h-9 w-9" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="truncate text-[18px] leading-6 font-extrabold">{profile.className}</p>
                  <p className="text-[13px] font-bold text-[#afafaf]">{profile.classSize} học viên</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#fff4d4] px-3 py-2.5">
                <BoltIcon />
                <p className="min-w-0">
                  <span className="text-[20px] leading-6 font-extrabold tabular-nums">{formatCount(profile.classXp)}</span>
                  <span className="ml-1.5 text-[13px] font-bold text-[#afafaf]">XP cả lớp</span>
                </p>
              </div>
              <p className="mt-2 text-[13px] font-bold text-[#afafaf]">Tổng XP mọi người trong lớp đã kiếm.</p>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-[#e5e5e5] bg-white px-4 py-5 text-center">
              <p className="text-[16px] font-extrabold">Bạn chưa ở trong lớp nào</p>
              <p className="mt-1 text-[13px] font-bold text-[#afafaf]">Khi được xếp lớp, XP của cả lớp hiện ở đây.</p>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-[22px] leading-7 font-extrabold tracking-tight">Huy hiệu</h2>
            <Link href="/badges" className="text-[13px] font-extrabold tracking-wide text-[#1cb0f6] uppercase">
              Tất cả
            </Link>
          </div>
          {profile === undefined ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
              {Array.from({ length: 6 }, (_, index) => (
                <li key={index} className="h-28 animate-pulse rounded-2xl bg-[#e2e7ff]" />
              ))}
            </ul>
          ) : profile && profile.badges.length > 0 ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
              {profile.badges.map((badge) => (
                <li key={badge.id}>
                  <button
                    type="button"
                    onClick={() => setOpenBadgeId(badge.id)}
                    className="flex h-full w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-[#e5e5e5] bg-white px-2 py-3 text-center"
                    aria-label={`${badge.title}, cấp ${badge.tier}`}
                  >
                    <BadgeMedal familyId={badge.id} tier={badge.tier} size={64} />
                    <span className="line-clamp-2 text-[12px] leading-4 font-extrabold">{badge.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border-2 border-[#e5e5e5] bg-white px-4 py-5 text-center text-[15px] font-extrabold">
              Chưa có huy hiệu. Học đều để mở huy hiệu đầu tiên.
            </p>
          )}
        </section>
      </main>

      <AnimatePresence>
        {settingsOpen ? (
          <BadgeSheet key="profile-settings" title="Cài đặt" onClose={() => setSettingsOpen(false)}>
            <div className="flex flex-col gap-3">
              <p className="text-[22px] font-extrabold text-[#3c3c3c]">Cài đặt</p>
              {isAdmin ? (
                <Link href="/admin" className={chunkyButton("secondary", "w-full")}>
                  Admin
                </Link>
              ) : null}
              <RecapShareButton className={chunkyButton("primary", "w-full")}>Chia sẻ tuần</RecapShareButton>
              <button type="button" onClick={onSignOut} className={chunkyButton("secondary", "w-full")}>
                Đăng xuất
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  onDelete();
                }}
                className="mx-auto mt-2 text-[13px] font-bold text-[#afafaf] underline"
              >
                Xóa tài khoản
              </button>
            </div>
          </BadgeSheet>
        ) : null}
        {openBadge ? (
          <FamilySheet key={openBadge.id} family={openBadge} onClose={() => setOpenBadgeId(null)} />
        ) : null}
      </AnimatePresence>
      <BottomNav />
    </div>
  );
}

export function AccountScreen({
  callbackUrl,
  isAdmin = false,
}: AccountScreenProps) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const user = session?.user;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function closeDelete() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteOwnAccount();
    if (!result.ok) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    discardDeviceProgress();
    await signOut({ callbackUrl: "/account" });
  }

  if (loading) {
    return (
      <main className="relative flex w-full flex-1 flex-col items-center justify-center bg-surface px-space-16">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Đang tải…
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <div 
        data-layout="wide"
        className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
      >
        <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
          <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                aria-label="Về bài học"
                className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7] active:scale-95"
              >
                <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
              </Link>
              <h1 className="font-headline-sm text-[17px] font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
                Đăng nhập
              </h1>
            </div>
          </div>
        </header>

        <main className="relative flex w-full flex-1 flex-col items-center bg-transparent">
          {/* Background decorative elements */}
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-50">
            <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[60%] rounded-full bg-blue-100/40 blur-[80px] md:-left-[5%] md:-top-[5%] md:h-[50%] md:w-[40%] md:blur-[120px]" />
            <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[60%] rounded-full bg-teal-100/30 blur-[80px] md:-bottom-[5%] md:-right-[5%] md:h-[50%] md:w-[40%] md:blur-[120px]" />
          </div>
          
          <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-32">
            <div className="flex flex-col items-center gap-4 text-center">
              <Image
                src="/logo192.png"
                alt="NaNu Nana"
                width={192}
                height={192}
                className="h-40 w-40 object-contain"
                priority
              />
              <div className="flex flex-col gap-2">
                <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                  NaNu Go
                </h1>
                <p className="max-w-[280px] text-lg font-medium text-[#86868b]">
                  Học và luyện tập tiếng Đức chuyên ngành.
                </p>
              </div>
            </div>

            <section className="flex w-full max-w-[400px] flex-col gap-6 rounded-[32px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <div className="flex flex-col gap-2 text-center">
                <h2 className="font-headline-sm text-[20px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
                  Bắt đầu học ngay
                </h2>
                <p className="text-[14px] font-medium text-[#86868b]">
                  Đăng nhập để lưu tiến độ và đồng bộ trên mọi thiết bị của bạn.
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  rememberClientDevice();
                  void signIn("google", { callbackUrl });
                }}
                className="group relative flex h-[56px] w-full items-center justify-center gap-3 overflow-hidden rounded-[16px] bg-white border border-black/[0.05] font-label-lg text-[16px] font-semibold text-[#1d1d1f] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#f5f5f7] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] active:scale-[0.98]"
              >
                <GoogleIcon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                <span>Tiếp tục với Google</span>
              </button>
              
              <p className="text-center text-[12px] font-medium text-[#86868b]">
                Bằng việc đăng nhập, bạn đồng ý với Điều khoản và Chính sách bảo mật của chúng tôi.
              </p>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <LearnerProfile
        image={user.image}
        email={user.email}
        isAdmin={isAdmin}
        onSignOut={() => {
          discardDeviceProgress();
          void signOut({ callbackUrl: "/account" });
        }}
        onDelete={() => {
          setDeleteError(null);
          setDeleteOpen(true);
        }}
      />
      {deleteOpen ? (
        <DeleteAccountDialog
          busy={deleting}
          error={deleteError}
          onClose={closeDelete}
          onConfirm={() => {
            void confirmDelete();
          }}
        />
      ) : null}
    </>
  );
}
