import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { explorerUrl, lunaToNim, shortAddress, shortHash, when } from "@/lib/format"
import { Slip } from "@/components/kit"

export const dynamic = "force-dynamic"

type Loaded =
  | { kind: "ok"; receipt: Awaited<ReturnType<typeof api.getReceipt>> }
  | { kind: "missing" }
  | { kind: "down" }

async function load(hash: string): Promise<Loaded> {
  try {
    return { kind: "ok", receipt: await api.getReceipt(hash) }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "missing" }
    return { kind: "down" }
  }
}

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const { hash } = await params
  const r = await load(hash)
  if (r.kind !== "ok") return { title: "Receipt · Kitty" }
  const who = r.receipt.contribution.display_name?.trim() || shortAddress(r.receipt.contribution.contributor_address)
  return {
    title: `${who} chipped in ${lunaToNim(r.receipt.contribution.amount_luna)} NIM · Kitty`,
    description: `A verified NIM payment into ${r.receipt.goal.title}, with its hash.`,
  }
}

/** A single receipt, at its own address.
 *
 *  This is the artifact the growth loop turns on: the person who paid forwards this
 *  page, and the next person arrives at a jar with proof in it rather than a pitch.
 *  Everything printed here is what the verifier read back off the chain. */
export default async function ReceiptPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params
  const r = await load(hash)
  if (r.kind === "missing") notFound()

  if (r.kind === "down") {
    return (
      <main className="pt-6">
        <div className="slip p-4">
          <p className="eyebrow">Receipt unavailable</p>
          <p className="mt-1.5 text-[15px] leading-snug font-medium">The index cannot be read right now</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            The payment itself is unaffected: it is on Nimiq, addressed to the jar owner, and it stays there.
          </p>
        </div>
      </main>
    )
  }

  const { contribution, goal } = r.receipt
  const who = contribution.display_name?.trim() || shortAddress(contribution.contributor_address)

  return (
    <main className="pt-5">
      <p className="eyebrow">Receipt</p>
      <h1 className="mt-2 text-[27px] leading-tight font-medium tracking-tight">
        {who} chipped in {lunaToNim(contribution.amount_luna)} NIM
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Straight into {goal.owner_address ? "the owner's own wallet" : "the owner's wallet"}, tagged with the jar. Kitty
        never held this coin: it read the payment back off the chain and printed what it found.
      </p>

      <Slip className="mt-5 p-4" press>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="eyebrow">Into</p>
            <Link href={`/g/${goal.id}`} className="mt-1 block text-[16px] font-medium leading-snug underline underline-offset-2">
              {goal.title}
            </Link>
          </div>
          <p className="tnum text-[24px] leading-none font-medium">+{lunaToNim(contribution.amount_luna)}</p>
        </div>

        <dl className="mt-4 grid gap-2 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          {[
            ["From", contribution.display_name?.trim() || contribution.contributor_address],
            ["When", contribution.verified_at ? when(contribution.verified_at) : "just now"],
            ["Confirmations", String(contribution.confirmations ?? 0)],
            ["Jar tag", goal.memo],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">{k}</dt>
              <dd className="truncate text-right text-[12.5px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Transaction hash</p>
          <p className="mt-1 break-all font-mono text-[11.5px] leading-relaxed text-ink">{contribution.tx_hash}</p>
          <a
            href={explorerUrl(contribution.tx_hash)}
            target="_blank"
            rel="noreferrer noopener"
            className="stamp-button mt-3 w-full"
            data-variant="quiet"
          >
            Open the transaction on Nimiq
          </a>
        </div>
      </Slip>

      <div className="mt-5 grid gap-2">
        <Link href={`/g/${goal.id}`} className="stamp-button w-full">
          Chip in to this jar
        </Link>
        <Link href="/proof" className="stamp-button w-full" data-variant="quiet">
          How Kitty checks a payment
        </Link>
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink-faint">
        Receipt {shortHash(contribution.tx_hash)} · printed from the Nimiq mainnet by{" "}
        <Link href="/" className="underline underline-offset-2">
          Kitty
        </Link>
        .
      </p>
    </main>
  )
}
