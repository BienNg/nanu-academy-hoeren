"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChunkyButton } from "@/components/chunkyButton";

type NumberInputCardProps = {
  onSubmit: (value: string) => void;
};

const EXTRA_KEYS = [",", ":"] as const;

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * Zahlen-Ohr: the student hears a price or time and types only the number.
 * Remount via parent `key` for each new card.
 */
export function NumberInputCard({ onSubmit }: NumberInputCardProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const canSubmit = value.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(value);
  };

  const insert = (char: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + char + value.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + char.length, start + char.length);
    });
  };

  return (
    <>
      <section className="mt-4 flex flex-col gap-3 rounded-[24px] border border-white/20 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name="pin" className="text-[22px]" />
          </div>
          <div className="flex flex-col">
            <label htmlFor={inputId} className="text-[17px] font-semibold leading-snug text-[#1d1d1f]">
              Bạn nghe con số nào?
            </label>
            <span className="text-[13px] text-[#86868b]">Zahlen-Ohr · chỉ gõ số (giá, giờ…)</span>
          </div>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="vd. 35,50 hoặc 15:30"
            className="h-14 min-w-0 flex-1 rounded-2xl bg-[#f5f5f7] px-4 text-center text-[24px] font-bold tabular-nums tracking-wide text-[#1d1d1f] placeholder:text-[16px] placeholder:font-medium placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30"
          />
          {EXTRA_KEYS.map((char) => (
            <button
              key={char}
              type="button"
              onClick={() => insert(char)}
              aria-label={`Thêm ${char}`}
              className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f5f7] text-[22px] font-bold text-[#1d1d1f] transition-colors hover:bg-[#e8e8ed] active:bg-[#0066cc] active:text-white"
            >
              {char}
            </button>
          ))}
        </form>
      </section>

      <footer className="mt-6 flex flex-col items-center gap-2">
        <ChunkyButton
          variant={canSubmit ? "primary" : "disabled"}
          disabled={!canSubmit}
          onClick={submit}
          className="w-full"
        >
          Kiểm tra · Prüfen
        </ChunkyButton>
      </footer>
    </>
  );
}
