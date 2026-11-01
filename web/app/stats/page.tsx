import { redirect } from "next/navigation"

/** The first build shipped /stats; the proof page replaced it. */
export default function StatsRedirect() {
  redirect("/proof")
}
