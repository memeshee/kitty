import Link from "next/link"
import { WalletMenu } from "@/components/WalletMenu"

/** The jar mark: a bone jar body, a lid, one amber coin. Same mark as the favicon. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="9" y="6.5" width="14" height="3.4" rx="1.7" fill="currentColor" />
      <rect x="10.5" y="10.6" width="11" height="14.6" rx="3.4" fill="currentColor" />
      <circle cx="16" cy="17.4" r="3.2" fill="var(--color-amber)" />
    </svg>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 -mx-5 mb-1 border-b-[1.5px] border-ink/15 bg-paper/85 px-5 py-3 backdrop-blur-[2px]">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Mark />
          <span className="text-[17px] font-medium tracking-tight">kitty</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/proof"
            className="hidden font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft hover:text-ink sm:block"
          >
            Proof
          </Link>
          <WalletMenu />
        </div>
      </div>
    </header>
  )
}
