"use client"

import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { lunaToNim, shortAddress } from "@/lib/format"
import type { Pace } from "@/lib/pace"

/* ---------------------------------------------------------------- surfaces */

/** A printed slip. The product's workhorse surface. */
export function Slip({
  children,
  className,
  press = false,
  as: Tag = "div",
}: {
  children?: ReactNode
  className?: string
  press?: boolean
  as?: "div" | "section" | "article" | "li" | "header"
}) {
  return <Tag className={cn(press ? "slip-press" : "slip", className)}>{children}</Tag>
}

/** The tear-off stub at the bottom of a slip. */
export function Stub({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("perforation rounded-b-[9px] bg-paper-deep/55 px-5 pb-4 pt-5", className)}>{children}</div>
  )
}

/* ---------------------------------------------------------------- controls */

export function Button({
  children,
  variant = "ink",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ink" | "amber" | "quiet"
  children: ReactNode
}) {
  const dataVariant = variant === "ink" ? undefined : variant
  return (
    <button className={cn("stamp-button", className)} data-variant={dataVariant} {...rest}>
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  id,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  id?: string
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-brick" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />
}

/** − value + with 44px targets. Used for target amounts and deadlines. */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  label,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  suffix: string
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <button
        type="button"
        className="chip"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={`Less ${label}`}
      >
        −
      </button>
      <output className="tnum min-w-[5.5rem] text-center text-[17px]">
        {value.toLocaleString("en-US")} <span className="text-[11px] text-ink-faint">{suffix}</span>
      </output>
      <button
        type="button"
        className="chip"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={`More ${label}`}
      >
        +
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------- money */

export function Amount({
  luna,
  className,
  prefix,
  suffix = "NIM",
}: {
  luna: string
  className?: string
  prefix?: string
  suffix?: string | null
}) {
  return (
    <span className={cn("tnum", className)}>
      {prefix}
      {lunaToNim(luna)}
      {suffix ? <span className="ml-1 text-[0.7em] text-ink-faint">{suffix}</span> : null}
    </span>
  )
}

export function AddressText({ address, className }: { address: string; className?: string }) {
  return (
    <span className={cn("tnum text-[11.5px] text-ink-faint", className)} title={address}>
      {shortAddress(address)}
    </span>
  )
}

/* ------------------------------------------------------------------ status */

export type Status = "collecting" | "met" | "closed" | "overdue"

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  collecting: { label: "Filling", className: "bg-amber text-ink" },
  met: { label: "Goal met", className: "bg-moss text-paper-light" },
  closed: { label: "Closed", className: "bg-ink text-paper-light" },
  overdue: { label: "Past the date", className: "bg-brick text-paper-light" },
}

export function StatusChip({ status, className }: { status: Status; className?: string }) {
  const s = STATUS_STYLE[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em]",
        s.className,
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  )
}

/** A rotated rubber stamp. Two uses only: the jar's state, and a verified mark. */
export function Stamp({ children, tone = "moss" }: { children: ReactNode; tone?: "moss" | "brick" | "ink" }) {
  const colour = tone === "brick" ? "text-brick border-brick" : tone === "ink" ? "text-ink border-ink" : "text-moss border-moss"
  return (
    <span
      className={cn(
        "inline-block -rotate-6 rounded-[4px] border-[2px] px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] opacity-80",
        colour,
      )}
    >
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- progress */

/** A ruled track with tick marks, filled amber. Compact form for lists and bars. */
export function ProgressTrack({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("relative h-3.5 overflow-hidden rounded-full border-[1.5px] border-ink bg-paper-deep", className)}
    >
      <div
        className="absolute inset-y-0 left-0 bg-amber transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%` }}
      >
        <span className="absolute inset-y-0 right-0 w-[1.5px] bg-ink" />
      </div>
      <div aria-hidden className="absolute inset-0 flex justify-between px-[25%]">
        {[0, 1].map((i) => (
          <span key={i} className="h-full w-px bg-ink/20" />
        ))}
      </div>
    </div>
  )
}

/** Initials tag for a person on the ledger. Deterministic colour per address. */
export function BackerTag({ name, seed, label }: { name: string; seed: string; label?: string }) {
  const palette = ["bg-amber-wash", "bg-sky", "bg-paper-deep"]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  const bg = palette[hash % palette.length]
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[10.5px] font-bold",
        bg,
      )}
      title={label ?? name}
    >
      {initials || "•"}
    </span>
  )
}

/* ------------------------------------------------------------- pace header */

/** The four facts that decide whether a jar lands, in one line of mono. */
export function PaceLine({ pace, className }: { pace: Pace; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft", className)}>
      <span>{pace.daysLeft > 0 ? `${pace.daysLeft} days left` : "date passed"}</span>
      <span aria-hidden className="text-ink-faint">/</span>
      <span>{pace.neededPerDay.toLocaleString("en-US")} NIM a day</span>
      <span aria-hidden className="text-ink-faint">/</span>
      <span className={pace.onTrack ? "text-moss" : "text-brick"}>{pace.onTrack ? "on pace" : "behind"}</span>
    </p>
  )
}
