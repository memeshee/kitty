"use client"

import { useEffect } from "react"
import { wake } from "@/lib/api"

/** Mounted once in the root layout.
 *
 *  The API scales to zero, so some visit will land on a suspended machine. This is
 *  the mitigation that costs nothing: the moment the page hydrates it asks for a
 *  machine, while the reader is still reading the headline, instead of leaving the
 *  wake-up to the first thing they actually tap. By then the resume (a few hundred
 *  milliseconds) has already happened.
 */
export function Wake() {
  useEffect(() => {
    wake()
  }, [])
  return null
}
