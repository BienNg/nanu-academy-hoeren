/**
 * Duolingo-style 3D button: a solid darker "lip" under the face that the
 * button sinks into on press. The lip is a hard box-shadow rather than a
 * bottom border, so pressing never shifts the surrounding layout.
 * Returns a class string so it works on <button>, <Link> and motion.button.
 */
export type ChunkyVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "disabled";

const BASE =
  "flex h-[52px] items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-extrabold uppercase tracking-[0.08em] select-none transition-[translate,box-shadow,filter,background-color] duration-100";

const PRESSABLE = "active:translate-y-[4px] active:shadow-none";

const VARIANTS: Record<ChunkyVariant, string> = {
  primary: `bg-[#0066cc] text-white shadow-[0_4px_0_#004c99] hover:brightness-110 ${PRESSABLE}`,
  secondary: `border-2 border-[#e5e5ea] bg-white text-[#0066cc] shadow-[0_4px_0_#e5e5ea] hover:bg-[#f7f7f9] ${PRESSABLE}`,
  success: `bg-[#34C759] text-white shadow-[0_4px_0_#248a3d] hover:brightness-105 ${PRESSABLE}`,
  danger: `bg-[#ff3b30] text-white shadow-[0_4px_0_#c4261d] hover:brightness-105 ${PRESSABLE}`,
  disabled: "cursor-not-allowed bg-[#e5e5ea] text-[#aeaeb2]",
};

export function chunkyButton(
  variant: ChunkyVariant = "primary",
  className = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${className}`.trim();
}
