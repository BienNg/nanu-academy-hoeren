"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { CheckBar } from "@/components/session/FeedbackSheet";

const SPECIAL_CHARS = ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"] as const;

type DictationInputCardProps = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  /** Controlled value — keeps the draft when feedback is shown above. */
  value?: string;
  onChange?: (value: string) => void;
  /** Vietnamese prompt. Shown in the same row multiple choice uses. */
  prompt?: string;
  /** Parent renders Kiểm tra in a shared action row. */
  showSubmit?: boolean;
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
  prompt,
  showSubmit = true,
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

  const handleSubmit = useCallback(() => {
    if (value.trim().length === 0 || disabled) return;
    onSubmit(value);
  }, [disabled, onSubmit, value]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      if (!canSubmit) return;
      event.preventDefault();
      event.stopPropagation();
      handleSubmit();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canSubmit, handleSubmit]);

  return (
    <>
      {prompt ? (
        <section className="flex items-center gap-3 rounded-2xl border-2 border-[#e5e5ea] bg-white px-4 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <MaterialIcon name="translate" className="text-[22px]" />
          </div>
          <p className="text-[20px] font-bold leading-snug text-[#1d1d1f]">
            {prompt}
          </p>
        </section>
      ) : null}
      <section className="mt-6 flex flex-col gap-3">
        <label
          htmlFor={inputId}
          className="text-[20px] font-extrabold leading-tight text-[#1d1d1f]"
        >
          {prompt ? "Gõ tiếng Đức" : "Gõ lại những gì bạn nghe"}
        </label>

        <textarea
          ref={textareaRef}
          id={inputId}
          rows={4}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          placeholder={prompt ? "Gõ câu tiếng Đức vào đây..." : "Gõ bằng tiếng Đức (Diktat)..."}
          className="w-full resize-none rounded-2xl border-2 border-[#e5e5ea] bg-[#f7f7f9] px-4 py-3 text-lg font-medium leading-relaxed text-[#1d1d1f] transition-colors placeholder:text-[#aeaeb2] focus:border-[#0066cc]/50 focus:bg-white focus:outline-none disabled:opacity-60"
        />

        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pt-1 pb-2">
          {SPECIAL_CHARS.map((char) => (
            <button
              key={char}
              type="button"
              disabled={disabled}
              onClick={() => insertChar(char)}
              className="flex h-11 min-w-[40px] flex-1 select-none items-center justify-center rounded-xl border-2 border-[#e5e5ea] bg-white text-[17px] font-bold text-[#1d1d1f] shadow-[0_3px_0_#e5e5ea] transition-[translate,box-shadow,background-color] duration-100 hover:bg-[#f7f7f9] active:translate-y-[3px] active:shadow-none disabled:opacity-40"
            >
              {char}
            </button>
          ))}
        </div>
      </section>

      {showSubmit ? <CheckBar disabled={!canSubmit} onClick={handleSubmit} /> : null}
    </>
  );
}
