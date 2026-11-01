"use client"

import { type ButtonHTMLAttributes, type ReactNode } from "react"

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "ghost"; children: ReactNode }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
  const styles = {
    primary: "bg-ink text-paper",
    quiet: "bg-paper-deep text-ink",
    ghost: "border border-ink/20 text-ink",
  }[variant]
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[12px] bg-paper-deep ${className}`} aria-hidden />
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[20px] border border-brick/30 bg-white/40 p-4">
      <p className="text-[14px] text-brick">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-3 text-[13px] font-medium text-ink underline underline-offset-4">
          Try again
        </button>
      ) : null}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-ink/15 px-5 py-10 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children ? <div className="mt-2 text-[13.5px] leading-relaxed text-slate">{children}</div> : null}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12.5px] text-slate">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  "w-full rounded-[12px] border border-ink/15 bg-white/50 px-4 py-3 text-[15px] text-ink placeholder:text-slate/70 focus:border-ink/40"
