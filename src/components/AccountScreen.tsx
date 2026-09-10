"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useProgress } from "@/lib/useProgress";

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

export function AccountScreen() {
  const { data: session, status } = useSession();
  const { continueLearning, streakDays } = useProgress();
  const loading = status === "loading";
  const user = session?.user;

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-surface/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between px-space-16">
          <div className="flex items-center gap-space-8">
            <Link
              href="/"
              aria-label="Về trang chủ"
              className="-ml-space-8 flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="arrow_back_ios_new" className="text-[22px]" />
            </Link>
            <h1 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">
              Tài khoản
            </h1>
          </div>
        </div>
      </header>

      <main className="relative flex w-full flex-1 flex-col bg-surface">
        <div className="flex w-full flex-col gap-space-24 px-space-16 pb-space-32">
          <section className="flex flex-col gap-space-16 rounded-3xl bg-surface-container-lowest p-space-20 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
            {loading ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Đang tải…
              </p>
            ) : user ? (
              <>
                <div className="flex items-center gap-space-16">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary">
                      <MaterialIcon name="person" className="text-[32px]" />
                    </div>
                  )}
                  <div className="min-w-0 flex flex-col gap-1">
                    <h2 className="truncate font-headline-sm text-headline-sm text-on-surface">
                      {user.name ?? "Học viên NaNu"}
                    </h2>
                    {user.email ? (
                      <p className="truncate font-body-sm text-body-sm text-on-surface-variant">
                        {user.email}
                      </p>
                    ) : null}
                    <p className="font-caption text-caption text-primary-container">
                      Đã đăng nhập bằng Google
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/account" })}
                  className="flex h-[48px] w-full items-center justify-center gap-space-8 rounded-2xl border border-outline-variant/50 bg-surface font-label-lg text-label-lg text-on-surface transition-all hover:bg-surface-container active:scale-[0.98]"
                >
                  <MaterialIcon name="logout" className="text-[20px]" />
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-space-8">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Lưu tiến độ học
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Đăng nhập bằng Google để đồng bộ tiến độ giữa các thiết bị.
                    Tiến độ trên máy này sẽ được gộp khi bạn đăng nhập.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/account" })}
                  className="flex h-[52px] w-full items-center justify-center gap-space-8 rounded-2xl bg-primary-container font-label-lg text-label-lg text-on-primary shadow-[0_2px_8px_rgba(0,113,227,0.25)] transition-all hover:opacity-95 active:scale-[0.98]"
                >
                  <MaterialIcon name="login" className="text-[20px]" />
                  Đăng nhập với Google
                </button>
              </>
            )}
          </section>

          <section className="flex flex-col gap-space-12 rounded-3xl border border-surface-container bg-surface-container-lowest p-space-20">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              Tiến độ trên thiết bị
            </h2>
            <div className="flex flex-col gap-space-8 font-body-sm text-body-sm text-on-surface-variant">
              <div className="flex items-center justify-between">
                <span>Chuỗi ngày luyện</span>
                <span className="font-semibold text-on-surface">
                  {streakDays} ngày
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Ausbildung · đã hoàn thành</span>
                <span className="font-semibold text-on-surface">
                  {continueLearning.completedCount} /{" "}
                  {Math.max(continueLearning.totalClips, 1)} câu
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Đồng bộ đám mây</span>
                <span className="font-semibold text-on-surface">
                  {user ? "Bật khi đăng nhập" : "Cần đăng nhập"}
                </span>
              </div>
            </div>
            <Link
              href={continueLearning.href}
              className="mt-space-4 inline-flex h-[44px] items-center justify-center gap-space-8 rounded-xl bg-surface-container-high font-label-sm text-label-sm font-semibold text-on-surface transition-all hover:opacity-95 active:scale-[0.98]"
            >
              Tiếp tục luyện
              <MaterialIcon name="arrow_forward" className="text-[16px]" />
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
