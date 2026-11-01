import { api } from "@/lib/api"
import { lunaToNim } from "@/lib/format"
import { HomeActions } from "@/components/HomeActions"

export const dynamic = "force-dynamic"

async function live() {
  try {
    return await api.getStats()
  } catch {
    return null
  }
}

export default async function Home() {
  const stats = await live()

  return (
    <main>
      <div className="flex items-baseline justify-between pt-2">
        <span className="text-[19px] font-medium tracking-tight text-ink">kitty</span>
        <a href="/stats" className="text-[12.5px] text-slate underline-offset-4 hover:underline">
          Public numbers
        </a>
      </div>

      <h1 className="mt-10 text-[38px] leading-[1.02] font-medium tracking-tight text-ink">
        A jar your
        <br />
        people fill.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Name what you are saving for and share one link. Family chips in from their own phones, every coin is a real NIM
        payment, and the receipts are public.
      </p>

      <div className="mt-7">
        <HomeActions />
      </div>

      <section className="mt-12">
        <ul className="divide-y divide-ink/10">
          <li className="py-4">
            <p className="text-[15px] font-medium text-ink">Name it</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-slate">
              School fees, a bike, a wedding. A target and a date is all a jar needs.
            </p>
          </li>
          <li className="py-4">
            <p className="text-[15px] font-medium text-ink">Share it</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-slate">
              One link goes to WhatsApp. Anyone with Nimiq Pay can chip in, in any amount.
            </p>
          </li>
          <li className="py-4">
            <p className="text-[15px] font-medium text-ink">Watch it fill</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-slate">
              Coins land in your own wallet, not with us, and every one leaves a receipt anyone can open.
            </p>
          </li>
        </ul>
      </section>

      {stats && stats.goals > 0 ? (
        <section className="mt-10 rounded-[20px] bg-ink px-5 py-5">
          <p className="text-[13px] text-paper/70">So far, all checkable on chain</p>
          <p className="tnum mt-2 text-[22px] leading-tight font-medium text-paper">
            {stats.goals} {stats.goals === 1 ? "jar" : "jars"} · {lunaToNim(stats.total_luna)} NIM ·{" "}
            {stats.distinct_contributors} {stats.distinct_contributors === 1 ? "person" : "people"}
          </p>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-ink/10 pt-4">
        <p className="text-[12px] leading-relaxed text-slate">
          Kitty holds no money and no keys. It runs inside Nimiq Pay, on the Nimiq mainnet.{" "}
          <a href="https://github.com/memeshee/kitty" className="underline underline-offset-4">
            Source
          </a>
        </p>
      </footer>
    </main>
  )
}
