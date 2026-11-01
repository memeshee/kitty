import { redirect } from "next/navigation"

/** The first build shipped /new; keep the old link working. */
export default function NewRedirect() {
  redirect("/create")
}
