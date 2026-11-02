/** One derived instruction per viewer, so the page never makes someone work out
 *  what to do next. Order matters: the jar's state first, then the viewer's role. */

import type { Goal, Contribution } from "@/lib/api"
import type { Pace } from "@/lib/pace"

export type StepKey = "share" | "chipin" | "thank" | "close" | "closed" | "met"

export const STEP_ORDER: { key: StepKey; label: string }[] = [
  { key: "share", label: "Share" },
  { key: "chipin", label: "Chip in" },
  { key: "met", label: "Funded" },
  { key: "thank", label: "Thank" },
  { key: "closed", label: "Closed" },
]

export type NextStep = {
  key: StepKey
  title: string
  body: string
  /** id of the element to scroll to, without the hash */
  target?: string
  /** what the primary button should say, when there is one */
  cta?: string
}

export function nextStep(input: {
  goal: Goal
  pace: Pace
  viewerAddress: string | null
  isOwner: boolean
  contributions: Contribution[]
}): NextStep {
  const { goal, pace, isOwner, viewerAddress, contributions } = input
  const raised = BigInt(goal.raised_luna || "0")
  const target = BigInt(goal.target_luna || "0")
  const met = target > 0n && raised >= target

  if (goal.status === "closed") {
    return { key: "closed", title: "This jar is closed", body: "The receipts below stay public forever." }
  }

  if (met) {
    if (isOwner) {
      return {
        key: "thank",
        title: "Say thank you",
        body: "The goal is met. A note from you is the thing people came back for.",
        target: "owner-tools",
        cta: "Write a thank-you",
      }
    }
    return { key: "met", title: "The goal is met", body: "Every receipt below is a real NIM payment to the owner." }
  }

  if (isOwner) {
    return {
      key: "share",
      title: contributions.length === 0 ? "Send the link to your people" : "Send the link again",
      body:
        contributions.length === 0
          ? "Nothing lands until someone sees it. WhatsApp is where these collections already happen."
          : pace.verdict,
      target: "share",
      cta: "Share the jar",
    }
  }

  if (!viewerAddress) {
    return {
      key: "chipin",
      title: "Chip in",
      body: "Any amount, from your own Nimiq wallet. In a browser it opens Nimiq's wallet; inside Nimiq Pay it is one tap.",
      target: "chipin",
      cta: "Chip in",
    }
  }

  return {
    key: "chipin",
    title: pace.daysLeft > 0 ? `${pace.daysLeft} ${pace.daysLeft === 1 ? "day" : "days"} left` : "Any amount helps",
    body: pace.verdict,
    target: "chipin",
    cta: "Chip in",
  }
}
