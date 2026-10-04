/**
 * Shared rules for the window-level shortcuts on study and practice cards.
 * A shortcut must never steal a key the focused element already uses:
 * Enter on a button clicks it, arrows in a text field move the caret.
 */

const ACTIVATES_ON_ENTER =
  "button, a[href], select, summary, [role='button'], [role='tab'], [role='radio'], [role='checkbox']";
const TEXT_ENTRY = "input, textarea, select, [contenteditable='true']";

function closest(target: EventTarget | null, selector: string): Element | null {
  return target instanceof Element ? target.closest(selector) : null;
}

/** Enter on this element already does something, such as clicking a button. */
export function enterOwnedByTarget(target: EventTarget | null): boolean {
  return closest(target, ACTIVATES_ON_ENTER) !== null;
}

/** Typing here edits text, so letter, digit, Space and arrow shortcuts stay out. */
export function isTextEntry(target: EventTarget | null): boolean {
  return closest(target, TEXT_ENTRY) !== null;
}

/**
 * Card shortcuts are off while an IME is composing and while focus sits in a
 * dialog (such as "Đợi đã!"), so keys never act on the card behind it.
 */
export function cardShortcutsBlocked(event: KeyboardEvent): boolean {
  return event.isComposing || closest(event.target, "[role='dialog']") !== null;
}

export function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/** Enter with no modifier, aimed at the card rather than a focused control. */
export function isCardEnter(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !hasModifier(event) &&
    !cardShortcutsBlocked(event) &&
    !enterOwnedByTarget(event.target)
  );
}

/** 1–9 → 0–8, 0 → 9. Null for any other key, a modifier, or focus in a text field. */
export function digitShortcut(event: KeyboardEvent): number | null {
  if (hasModifier(event) || event.shiftKey || cardShortcutsBlocked(event)) return null;
  if (isTextEntry(event.target)) return null;
  if (!/^[0-9]$/.test(event.key)) return null;
  const digit = Number(event.key);
  return digit === 0 ? 9 : digit - 1;
}

/** The digit that picks the item at `index`, matching `digitShortcut`. */
export function digitLabel(index: number): string {
  return String((index + 1) % 10);
}

/** A click that came from Enter or Space rather than a pointer. */
export function isKeyboardClick(event: { detail: number }): boolean {
  return event.detail === 0;
}

/** Visible ring for keyboard focus only. */
export const FOCUS_RING =
  "outline-none focus-visible:ring-4 focus-visible:ring-[#0066cc]/35";
