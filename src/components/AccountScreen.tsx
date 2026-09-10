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
  interviewClipTotals: Record<string, number>;
};

export function AccountScreen({
  callbackUrl,
  interviewClipTotals,
}: AccountScreenProps) {
  const { data: session, status } = useSession();
  const { continueLearning, streakDays } = useProgress(interviewClipTotals);
  const loading = status === "loading";
  const user = session?.user;

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
      <main className="relative flex w-full flex-1 flex-col bg-transparent">
        {/* Background decorative elements */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[60%] rounded-full bg-primary/20 blur-[80px] md:-left-[5%] md:-top-[5%] md:h-[50%] md:w-[40%] md:blur-[120px]" />
          <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[60%] rounded-full bg-secondary-container/40 blur-[80px] md:-bottom-[5%] md:-right-[5%] md:h-[50%] md:w-[40%] md:blur-[120px]" />
        </div>
        
        <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center gap-space-32 px-space-24 pb-space-32">
          <div className="flex flex-col items-center gap-space-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-xl shadow-primary/30">
              <MaterialIcon name="hearing" className="text-[40px]" />
            </div>
            <div className="flex flex-col gap-space-8">
              <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight text-on-surface">
                NaNu Academy<br />Hören
              </h1>
              <p className="max-w-[280px] font-body-lg text-body-lg text-on-surface-variant">
                Luyện nghe và chép chính tả tiếng Đức chuyên ngành.
              </p>
            </div>
          </div>

          <section className="flex w-full max-w-[400px] flex-col gap-space-24 rounded-[32px] border border-surface-container-high/50 bg-surface-container-lowest/80 p-space-24 shadow-2xl shadow-black/5 backdrop-blur-xl">
            <div className="flex flex-col gap-space-8 text-center">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Bắt đầu học ngay
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Đăng nhập để lưu tiến độ và đồng bộ trên mọi thiết bị của bạn.
              </p>
            </div>
            
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl })}
              className="group relative flex h-[56px] w-full items-center justify-center gap-space-12 overflow-hidden rounded-2xl bg-white font-label-lg text-[16px] font-semibold text-[#3c4043] shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all hover:bg-gray-50 hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] active:scale-[0.98]"
            >
              <GoogleIcon className="h-6 w-6 transition-transform group-hover:scale-110" />
              <span>Tiếp tục với Google</span>
            </button>
            
            <p className="text-center font-caption text-[12px] text-outline">
              Bằng việc đăng nhập, bạn đồng ý với Điều khoản và Chính sách bảo mật của chúng tôi.
            </p>
          </section>
        </div>
      </main>
    );
  }

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

      <main className="relative flex w-full flex-1 flex-col bg-transparent">
        {/* Background decorative elements */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-[20%] top-[0%] h-[30%] w-[70%] rounded-full bg-primary/10 blur-[100px] md:-left-[10%] md:h-[40%] md:w-[50%] md:blur-[120px]" />
        </div>
        
        <div className="relative z-10 flex w-full flex-col gap-space-24 px-space-16 pb-space-32 pt-space-16">
          <section className="flex flex-col gap-space-20 rounded-[32px] border border-surface-container-high/30 bg-surface-container-lowest/80 p-space-24 shadow-xl shadow-black/[0.03] backdrop-blur-xl">
            <div className="flex items-center gap-space-16">
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full shadow-sm">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt=""
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary text-on-primary">
                    <MaterialIcon name="person" className="text-[36px]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 flex-col justify-center gap-1">
                <h2 className="truncate font-headline-sm text-[20px] font-bold text-on-surface">
                  {user.name ?? "Học viên NaNu"}
                </h2>
                {user.email ? (
                  <p className="truncate font-body-sm text-[14px] text-on-surface-variant">
                    {user.email}
                  </p>
                ) : null}
                <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
                  <GoogleIcon className="h-3 w-3" />
                  <span className="font-caption text-[11px] font-medium text-primary">
                    Đã liên kết
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/account" })}
              className="flex h-[48px] w-full items-center justify-center gap-space-8 rounded-2xl border border-outline-variant/50 bg-white font-label-lg text-[15px] font-semibold text-error transition-all hover:bg-error/5 hover:border-error/30 active:scale-[0.98]"
            >
              <MaterialIcon name="logout" className="text-[20px]" />
              Đăng xuất
            </button>
          </section>

          <section className="flex flex-col gap-space-16 rounded-[32px] border border-surface-container-high/50 bg-surface-container-lowest/60 p-space-24 shadow-lg shadow-black/[0.02]">
            <div className="flex items-center gap-space-12">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary shadow-sm">
                <MaterialIcon name="monitoring" className="text-[22px]" />
              </div>
              <h2 className="font-headline-sm text-[18px] font-bold text-on-surface">
                Tiến độ học
              </h2>
            </div>
            
            <div className="flex flex-col gap-space-12 rounded-2xl bg-surface-container-low/50 p-space-16">
              <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-space-12">
                <div className="flex items-center gap-space-8 text-on-surface-variant">
                  <MaterialIcon name="local_fire_department" className="text-[18px] text-primary" filled />
                  <span className="font-body-sm text-[14px]">Chuỗi ngày luyện</span>
                </div>
                <span className="font-label-lg text-[15px] font-bold text-on-surface">
                  {streakDays} ngày
                </span>
              </div>
              
              <div className="flex items-center justify-between border-b border-surface-container-high/50 pb-space-12">
                <div className="flex items-center gap-space-8 text-on-surface-variant">
                  <MaterialIcon name="task_alt" className="text-[18px] text-primary" filled />
                  <span className="font-body-sm text-[14px]">Đã hoàn thành</span>
                </div>
                <span className="font-label-lg text-[15px] font-bold text-on-surface">
                  {continueLearning.completedCount} / {Math.max(continueLearning.totalClips, 1)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-8 text-on-surface-variant">
                  <MaterialIcon name="cloud_sync" className="text-[18px] text-primary" filled />
                  <span className="font-body-sm text-[14px]">Đồng bộ đám mây</span>
                </div>
                <span className="font-label-lg text-[13px] font-semibold text-primary">
                  Đang bật
                </span>
              </div>
            </div>
            
            <Link
              href={continueLearning.href}
              className="mt-space-4 flex h-[52px] w-full items-center justify-center gap-space-8 rounded-2xl bg-primary-container font-label-lg text-[16px] font-semibold text-on-primary shadow-[0_4px_12px_rgba(0,113,227,0.2)] transition-all hover:opacity-95 active:scale-[0.98]"
            >
              Tiếp tục luyện
              <MaterialIcon name="arrow_forward" className="text-[18px]" />
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
