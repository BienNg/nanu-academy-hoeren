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
      <section className="mt-space-16 flex flex-col gap-space-12 rounded-[24px] bg-surface-container-lowest p-space-20 shadow-sm md:p-space-24">
        <label
          htmlFor={inputId}
          className="font-label-sm text-label-sm uppercase tracking-wider text-secondary"
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
            className="w-full resize-none bg-transparent font-body-lg text-body-lg leading-relaxed text-on-surface placeholder:text-secondary focus:outline-none disabled:opacity-60"
          />
        </div>

        <div className="pt-space-8">
          <div className="-mx-space-4 flex items-center justify-between gap-space-4 overflow-x-auto px-space-4 pb-space-2">
            {SPECIAL_CHARS.map((char) => (
              <button
                key={char}
                type="button"
                disabled={disabled}
                onClick={() => insertChar(char)}
                className="flex h-10 min-w-[36px] flex-1 items-center justify-center rounded-xl bg-surface-container font-label-md text-label-md text-on-surface transition-colors active:bg-primary active:text-on-primary disabled:opacity-40"
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="mt-space-24 flex flex-col items-center gap-space-8">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={`flex h-[52px] w-full items-center justify-center gap-space-8 rounded-2xl px-space-24 py-space-12 font-label-lg text-label-lg transition-all ${
            canSubmit
              ? "bg-primary text-on-primary shadow-md hover:opacity-95 active:scale-[0.98]"
              : "cursor-not-allowed bg-secondary-container text-secondary"
          }`}
        >
          <span>Kiểm tra · Prüfen</span>
          <MaterialIcon name="arrow_forward" className="text-[20px]" />
        </button>
      </footer>
    </>
  );
}
