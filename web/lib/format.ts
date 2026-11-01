/** Luna is the smallest NIM unit: 1 NIM = 100,000 Luna. Money is always an
 *  integer string on the wire and in the database, never a float. */

const LUNA = 100_000n

export function lunaToNim(luna: string): string {
  const n = BigInt(luna || "0")
  const whole = n / LUNA
  const frac = (n % LUNA).toString().padStart(5, "0").replace(/0+$/, "")
  return frac.length ? `${group(whole.toString())}.${frac}` : group(whole.toString())
}

export function nimToLuna(nim: string): string {
  const clean = nim.trim().replace(/,/g, "")
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") throw new Error("Enter an amount")
  const [w, f = ""] = clean.split(".")
  if (f.length > 5) throw new Error("NIM has 5 decimals")
  const whole = BigInt(w || "0")
  const frac = BigInt((f + "00000").slice(0, 5))
  return (whole * LUNA + frac).toString()
}

function group(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function pct(raised: string, target: string): number {
  const r = BigInt(raised || "0")
  const t = BigInt(target || "0")
  if (t <= 0n) return 0
  return Math.min(100, Number((r * 100n) / t))
}

export function shortAddress(a: string): string {
  const s = a.replace(/\s/g, "")
  return s.length > 14 ? `${s.slice(0, 7)}…${s.slice(-4)}` : s
}

export function shortHash(h: string): string {
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h
}

export function explorerUrl(hash: string): string {
  return `https://nimiq.watch/#${hash}`
}

export function dayCount(deadline: string): number {
  const d = new Date(`${deadline}T23:59:59Z`).getTime()
  return Math.ceil((d - Date.now()) / 86_400_000)
}

export function when(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  if (s < 604_800) return `${Math.floor(s / 86_400)} d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
