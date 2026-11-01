"use client"

import { Amount } from "@/components/kit"
import type { Pace } from "@/lib/pace"
import type { Goal } from "@/lib/api"

/** Phone-first action bar: what is in the jar, and the one thing to do about it. */
export function StickyBar({
  goal,
  pace,
  action,
  onAction,
  disabled,
}: {
  goal: Goal
  pace: Pace
  action: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-paper-light/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 backdrop-blur-[2px] md:hidden">
      <div className="mx-auto flex max-w-[520px] items-center justify-between gap-3">
        <div>
          <p className="eyebrow">In the jar</p>
          <p className="mt-0.5">
            <Amount luna={goal.raised_luna} className="text-[17px] font-medium" />
            <span className="ml-1 text-[11px] text-ink-faint">/ {Number(goal.target_luna) > 0 ? "" : ""}{pace.percent}%</span>
          </p>
        </div>
        <button onClick={onAction} disabled={disabled} className="stamp-button min-h-[46px] px-5 text-[14px]">
          {action}
        </button>
      </div>
    </div>
  )
}
