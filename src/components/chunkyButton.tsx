"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { FOCUS_RING } from "@/lib/keyboard";

/**
 * Duolingo-style 3D button: a solid darker "lip" under the face that the
 * button sinks into on press. The lip is a hard box-shadow rather than a
 * bottom border, so pressing never shifts the surrounding layout.
 * `chunkyButton` returns a class string for <Link> and motion.button.
 * `ChunkyButton` is the shared <button> so the markup is not copied per screen;
 * its press is a spring that sinks the face into the lip instead of the CSS one.
 * The lip depth reads `--lip`, so the spring only has to move that variable.
 */
export type ChunkyVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "inverse"
  | "disabled";

const BASE =
  `flex h-[52px] items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-extrabold uppercase tracking-[0.08em] select-none duration-100 ${FOCUS_RING}`;

/** The CSS press, kept for <Link> and plain <button> callers of `chunkyButton`. */
const CSS_PRESS =
  "transition-[translate,box-shadow,filter,background-color] active:translate-y-[4px] active:shadow-none";

/** Spring presses own translate and the lip, so only colors transition in CSS. */
const SPRING_PRESS = "transition-[filter,background-color]";

const VARIANTS: Record<ChunkyVariant, string> = {
  primary: "bg-[#0066cc] text-white shadow-[0_var(--lip,4px)_0_#004c99] hover:brightness-110",
  secondary: "border-2 border-[#e5e5ea] bg-white text-[#0066cc] shadow-[0_var(--lip,4px)_0_#e5e5ea] hover:bg-[#f7f7f9]",
  success: "bg-[#34C759] text-white shadow-[0_var(--lip,4px)_0_#248a3d] hover:brightness-105",
  danger: "bg-[#ff3b30] text-white shadow-[0_var(--lip,4px)_0_#c4261d] hover:brightness-105",
  /** White on a colored screen, such as the orange streak day. */
  inverse: "bg-white text-[#ff9500] shadow-[0_var(--lip,4px)_0_#ffd59a] hover:bg-[#fffaf2]",
  disabled: "cursor-not-allowed bg-[#e5e5ea] text-[#aeaeb2]",
};

/** Stiff and well damped: the face lands in the lip without bouncing layout. */
export const CHUNKY_PRESS_SPRING = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
  mass: 0.6,
};

function chunkyClasses(variant: ChunkyVariant, className: string, press: string): string {
  const pressable = variant === "disabled" ? "" : press;
  return `${BASE} ${VARIANTS[variant]} ${pressable} ${className}`.trim();
}

export function chunkyButton(
  variant: ChunkyVariant = "primary",
  className = "",
): string {
  return chunkyClasses(variant, className, CSS_PRESS);
}

type ChunkyButtonProps = HTMLMotionProps<"button"> & {
  variant?: ChunkyVariant;
};

export function ChunkyButton({
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  ...props
}: ChunkyButtonProps) {
  // Reduced motion keeps the static control: no spring and no CSS press.
  const reduceMotion = useReducedMotion() === true;
  const spring = !reduceMotion && !disabled && variant !== "disabled";
  return (
    <motion.button
      type={type}
      disabled={disabled}
      className={chunkyClasses(variant, className, SPRING_PRESS)}
      initial={false}
      animate={{ y: 0, "--lip": "4px" }}
      whileTap={spring ? { y: 4, "--lip": "0px" } : undefined}
      transition={CHUNKY_PRESS_SPRING}
      {...props}
    />
  );
}
