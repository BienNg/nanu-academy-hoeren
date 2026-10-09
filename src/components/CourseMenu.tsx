"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type CourseMenuItem = {
  slug: string;
  label: string;
  href: string;
  unlocked: boolean;
};

function GermanFlag() {
  const clipId = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 22 15"
      className="mr-1.5 h-[15px] w-[22px] shrink-0"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="22" height="15" rx="2.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="22" height="5" fill="#000" />
        <rect y="5" width="22" height="5" fill="#DD0000" />
        <rect y="10" width="22" height="5" fill="#FFCE00" />
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="21"
        height="14"
        rx="2"
        fill="none"
        stroke="rgba(19,27,46,0.18)"
      />
    </svg>
  );
}

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

function CourseRow({
  course,
  current,
  onPick,
}: {
  course: CourseMenuItem;
  current: boolean;
  onPick: () => void;
}) {
  if (!course.unlocked) {
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 text-[#94a3b8] ${
          current ? "bg-[#f8fafc]" : ""
        }`}
        aria-disabled="true"
        aria-current={current ? "page" : undefined}
      >
        <MaterialIcon name="lock" className="text-[18px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold">{course.label}</span>
          <span className="block text-[12px] font-bold">Nhờ giáo viên mở khóa</span>
        </span>
      </div>
    );
  }

  return (
    <Link
      href={course.href}
      aria-current={current ? "page" : undefined}
      onClick={onPick}
      className={`flex items-center gap-3 px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0284c7] ${
        current ? "bg-[#e0f2fe] text-[#0284c7]" : "text-[#131b2e] hover:bg-[#f8fafc]"
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{course.label}</span>
      {current ? <MaterialIcon name="check" className="text-[18px]" /> : null}
    </Link>
  );
}

export function CourseMenu({
  currentHref,
  levels,
  interviews,
  living = [],
}: {
  currentHref: string;
  levels: CourseMenuItem[];
  interviews: CourseMenuItem[];
  /** Leben-in-Deutschland workplaces. Empty hides the group. */
  living?: CourseMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const current = [...levels, ...interviews, ...living].find(
    (course) => course.href === currentHref,
  );
  const label = current?.label ?? "Khóa học";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Khóa học ${label}. Chọn khóa học khác.`}
        data-tour="course"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[11rem] items-center gap-0.5 text-[#0066cc] transition-opacity hover:opacity-80 active:opacity-60 sm:max-w-[16rem]"
      >
        <GermanFlag />
        <span className="truncate text-[17px] font-medium tracking-tight">{label}</span>
        <MaterialIcon name={open ? "expand_less" : "expand_more"} className="text-[22px]" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="absolute top-full left-0 z-50 mt-2 flex max-h-[min(70dvh,28rem)] w-[min(20rem,calc(100vw-3rem))] flex-col overflow-y-auto rounded-2xl border-2 border-[#e5e5e5] bg-white py-2 shadow-[0_8px_24px_rgba(19,27,46,0.12)]"
        >
          <h2 id={titleId} className="sr-only">
            Chọn khóa học
          </h2>
          <p className="px-3 pt-1 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#6e7881]">
            Luyện tập theo trình độ
          </p>
          <ul>
            {levels.map((course) => (
              <li key={course.slug}>
                <CourseRow
                  course={course}
                  current={course.href === currentHref}
                  onPick={() => setOpen(false)}
                />
              </li>
            ))}
          </ul>
          {interviews.length > 0 ? (
            <>
              <p className="mt-2 border-t border-[#e5e5e5] px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#6e7881]">
                Luyện phỏng vấn theo nghề
              </p>
              <ul>
                {interviews.map((course) => (
                  <li key={course.slug}>
                    <CourseRow
                      course={course}
                      current={course.href === currentHref}
                      onPick={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {living.length > 0 ? (
            <>
              <p className="mt-2 border-t border-[#e5e5e5] px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#6e7881]">
                Leben in Deutschland
              </p>
              <ul>
                {living.map((course) => (
                  <li key={course.slug}>
                    <CourseRow
                      course={course}
                      current={course.href === currentHref}
                      onPick={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
