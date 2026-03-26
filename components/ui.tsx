import clsx from "clsx";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  className,
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={clsx(
        "rounded-2xl bg-stone-900 border border-stone-800/80",
        "transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Pill({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-orange-500 text-white"
          : "bg-stone-800 text-stone-400 border border-stone-700/80"
      )}
    >
      {children}
    </div>
  );
}

export function Photo({
  src,
  alt,
  className,
  imgClassName,
  sizes = "96px"
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
}) {
  return (
    <div
      className={clsx(
        "relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-800",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className={clsx("object-cover", imgClassName)}
        sizes={sizes}
      />
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "food";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-full text-center font-bold leading-none transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 px-5 py-3";

  const styles =
    variant === "primary" || variant === "food"
      ? "bg-orange-500 text-white shadow-[0_6px_20px_rgba(249,115,22,0.32)] hover:bg-orange-400"
      : variant === "secondary"
        ? "bg-stone-800 text-stone-200 border border-stone-700 hover:bg-stone-700"
        : "bg-transparent text-stone-400 hover:text-stone-200";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(base, styles, className)}
    >
      {children}
    </button>
  );
}
