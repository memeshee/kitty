/** The arithmetic of a collection: how far along, at what pace, and whether the
 *  deadline is going to win. Everything here is derived, never stored, so the jar
 *  cannot drift from the receipts it is built on. */

import type { Goal } from "@/lib/api"
import { pct } from "@/lib/format"

export type Phase = "collecting" | "met" | "closed" | "overdue"

export type Pace = {
  phase: Phase
  /** 0..100, clamped */
  percent: number
  /** whole days until the deadline; negative once it has passed */
  daysLeft: number
  /** days the jar has been open, at least 1 */
  daysOpen: number
  /** NIM per day raised so far, floored to a whole NIM */
  perDay: number
  /** NIM per day still needed to land exactly on the deadline, fractional */
  neededPerDay: number
  /** NIM short at the current pace when the deadline arrives (0 when on track) */
  shortfall: number
  onTrack: boolean
  /** one plain sentence a person would actually say */
  verdict: string
}

const DAY = 86_400_000

/** A rate, not an amount: two decimals below 1 NIM, and never "1" for 0.17.
 *  Rounding a daily rate up to a whole coin made small jars look broken. */
export function rate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0"
  if (value >= 10) return value.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 1 })
  return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

export function readPace(goal: Goal, now = Date.now()): Pace {
  const raised = BigInt(goal.raised_luna || "0")
  const target = BigInt(goal.target_luna || "0")
  const percent = pct(goal.raised_luna, goal.target_luna)

  const deadline = new Date(`${goal.deadline}T23:59:59Z`).getTime()
  const daysLeft = Math.ceil((deadline - now) / DAY)
  const created = new Date(goal.created_at).getTime()
  const daysOpen = Math.max(1, Math.ceil((now - created) / DAY))

  const wholeRaised = Number(raised / 100_000n)
  const wholeTarget = Number(target / 100_000n)
  const remaining = Math.max(0, wholeTarget - wholeRaised)
  const perDay = Math.floor(wholeRaised / daysOpen)
  // Fractional on purpose: 5 NIM over 30 days is 0.17 a day, and printing "1 a day"
  // next to a 5 NIM target is the kind of arithmetic a reader stops trusting.
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : remaining

  const projected = wholeRaised + perDay * Math.max(0, daysLeft)
  const shortfall = Math.max(0, wholeTarget - projected)
  // A jar that opened in the last day has no pace to compare: it is not "behind".
  const justOpened = wholeRaised === 0 && daysOpen <= 1
  const onTrack = shortfall === 0 || justOpened

  let phase: Phase = "collecting"
  if (raised >= target && target > 0n) phase = "met"
  if (goal.status === "closed") phase = "closed"
  else if (daysLeft < 0 && phase !== "met") phase = "overdue"

  return {
    phase,
    percent,
    daysLeft,
    daysOpen,
    perDay,
    neededPerDay,
    shortfall,
    onTrack,
    verdict: justOpened
      ? daysLeft > 0
        ? `Just opened. ${rate(neededPerDay)} NIM a day fills it by the date.`
        : "Just opened. Any amount is the first receipt."
      : verdictFor({ phase, percent, daysLeft, remaining, perDay, neededPerDay, shortfall }),
  }
}

function verdictFor(i: {
  phase: Phase
  percent: number
  daysLeft: number
  remaining: number
  perDay: number
  neededPerDay: number
  shortfall: number
}): string {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 })
  switch (i.phase) {
    case "met":
      return "The goal is met. Every coin is already in the owner's wallet."
    case "closed":
      return "This jar is closed. The receipts stay public."
    case "overdue":
      return i.remaining > 0
        ? `The date passed with ${n(i.remaining)} NIM to go. The jar can still be filled.`
        : "The date passed and the goal was met."
    default:
      break
  }
  if (i.percent === 0) {
    return i.daysLeft > 0
      ? `Nothing in the jar yet, and ${i.daysLeft} ${i.daysLeft === 1 ? "day" : "days"} to go.`
      : "Nothing in the jar yet, and the date has passed."
  }
  if (i.daysLeft <= 0) return `The date passed with ${n(i.remaining)} NIM to go.`
  if (i.shortfall > 0) {
    return `At this pace the jar lands ${n(i.shortfall)} NIM short. It needs ${rate(i.neededPerDay)} NIM a day.`
  }
  return `On pace: ${n(i.perDay)} NIM a day so far, ${rate(i.neededPerDay)} needed.`
}
