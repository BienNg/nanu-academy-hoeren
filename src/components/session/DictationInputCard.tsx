"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

const SPECIAL_CHARS = ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"] as const;

type DictationInputCardProps = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  /** Controlled value — keeps the draft when feedback is shown above. */
  value?: string;
  onChange?: (value: string) => void;
};

function MaterialIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/**
 * Remount via parent `key={clipId}` when the active clip changes so the
 * textarea resets without an effect-driven setState.
 */
export function DictationInputCard({
  onSubmit,
  disabled = false,
  value: controlledValue,
  onChange,
}: DictationInputCardProps) {
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState("");
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const setValue = (next: string) => {
    if (!isControlled) setUncontrolledValue(next);
    onChange?.(next);
  };

  const canSubmit = value.trim().length > 0 && !disabled;

  const insertChar = (char: string) => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = value.slice(0, start) + char + value.slice(end);
    setValue(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + char.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    handleSubmit();
  };

  return (
    <>
      <section className="mt-4 flex flex-col gap-3 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <label
          htmlFor={inputId}
          className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]"
        >
          Bản chép chính tả (Diktat)
        </label>

        <div className="relative w-full">
          <textarea
            ref={textareaRef}
            id={inputId}
            rows={4}
            value={value}
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Gõ câu tiếng Đức bạn vừa nghe được vào đây..."
            className="w-full resize-none bg-transparent text-lg font-medium leading-relaxed text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none disabled:opacity-60"
          />
        </div>

        <div className="pt-2">
          <div className="-mx-1 flex items-center justify-between gap-1 overflow-x-auto px-1 pb-1">
            {SPECIAL_CHARS.map((char) => (
              <button
                key={char}
                type="button"
                disabled={disabled}
                onClick={() => insertChar(char)}
                className="flex h-10 min-w-[36px] flex-1 items-center justify-center rounded-xl bg-[#f5f5f7] font-semibold text-[#1d1d1f] transition-colors hover:bg-[#e8e8ed] active:bg-[#0066cc] active:text-white disabled:opacity-40"
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={`group flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] px-6 py-3 text-[17px] font-semibold transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            canSubmit
              ? "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98]"
              : "cursor-not-allowed bg-[#e8e8ed] text-[#86868b]"
          }`}
        >
          <span>Kiểm tra · Prüfen</span>
          <MaterialIcon name="arrow_forward" className="text-[20px] transition-transform duration-300 group-hover:translate-x-1" />
        </button>
      </footer>
    </>
  );
}
