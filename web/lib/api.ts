/** Typed client for the Kitty API. The backend is the authority on every
 *  contribution, so this layer never computes a total: it renders what it is given. */

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080"

export type Goal = {
  id: string
  owner_address: string
  title: string
  story: string
  target_luna: string
  deadline: string
  accent: string
  status: "open" | "closed"
  created_at: string
  raised_luna: string
  contributors_count: number
  share_url: string
  memo: string
}

export type Contribution = {
  id: number
  goal_id: string
  tx_hash: string
  contributor_address: string
  display_name: string | null
  note: string | null
  amount_luna: string
  block_number: number | null
  confirmations: number
  verified_at: string | null
  explorer_url: string
  pending?: boolean
}

export type Thanks = { id: number; goal_id: string; body: string; created_at: string }

export type Reconciliation = {
  balance_luna: string | null
  indexed_luna: string
  unindexed_luna: string | null
  block_number: number | null
  checked_at: string | null
  matches: boolean
}

export type GoalDetail = {
  goal: Goal
  contributions: Contribution[]
  thanks: Thanks[]
  /** null when the API could not read the public RPC; the receipts still stand */
  reconciliation: Reconciliation | null
  stats: { contributors_count: number; contributions_count: number; average_luna: string; last_contribution_at: string | null }
}

export type Stats = {
  goals: number
  contributions: number
  distinct_contributors: number
  total_luna: string
  verified_at: string
}

/** The public usage ledger: the number the world can recount for itself. */
export type LedgerReceipt = {
  tx_hash: string
  goal_id: string
  goal_title: string
  contributor_address: string
  display_name: string | null
  amount_luna: string
  verified_at: string
}

export type Ledger = {
  goals: number
  contributions: number
  distinct_wallets: number
  total_luna: string
  wallets: string[]
  recent: LedgerReceipt[]
  generated_at: string
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Cold starts are a real state once the API scales to zero, not an error.
 *  Fly holds a request while the machine resumes from its memory snapshot, so the
 *  first read of a quiet half hour can take seconds. These budgets exist to absorb
 *  that instead of rendering an empty page. */
const READ_TIMEOUT_MS = 8_000
const CALL_TIMEOUT_MS = 12_000
const RETRY_DELAY_MS = 400

/** What a wake-up looks like from the outside: the proxy answering before the
 *  machine has an answer of its own. */
const RETRYABLE_STATUS = new Set([502, 503, 504])

type ReadOptions = { revalidate?: number; timeoutMs?: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    // A 502 from the proxy is HTML, not our envelope. The status code still says
    // what happened, so parsing must never mask it.
    return {}
  }
}

/** `status === 0` means no answer at all: a waking machine, or a phone with one
 *  bar. A browser call retries it; a server render does not, because retrying
 *  there would spend the page's entire timeout budget twice. */
function isRetryable(e: unknown, offline: boolean): boolean {
  if (!(e instanceof ApiError)) return false
  return RETRYABLE_STATUS.has(e.status) || (offline && e.status === 0)
}

async function once<T>(path: string, init?: RequestInit, opts: ReadOptions = {}): Promise<T> {
  const { revalidate, timeoutMs = CALL_TIMEOUT_MS } = opts
  const serverRead = revalidate !== undefined
  const url = `${BASE}/v1${path}`
  const headers = { "content-type": "application/json", ...(init?.headers ?? {}) }

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers,
      // A hung socket is the normal shape of a cold start, so every request gets a
      // deadline instead of waiting for the platform to kill the page.
      signal: AbortSignal.timeout(timeoutMs),
      ...(serverRead ? { next: { revalidate } } : { cache: "no-store" as RequestCache }),
    })
  } catch {
    throw new ApiError(
      "network",
      serverRead
        ? "Kitty's index is unreachable right now."
        : "Can't reach Kitty right now. Check your connection and try again.",
      0,
    )
  }

  const body = safeJson(await res.text()) as { error?: { code?: string; message?: string } }
  if (!res.ok) {
    const e = body?.error ?? {}
    throw new ApiError(e.code ?? "unknown", e.message ?? "Something went wrong.", res.status)
  }
  return body as T
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await once<T>(path, init, { timeoutMs: CALL_TIMEOUT_MS })
  } catch (e) {
    if (!isRetryable(e, true)) throw e
    await sleep(RETRY_DELAY_MS)
    return once<T>(path, init, { timeoutMs: CALL_TIMEOUT_MS })
  }
}

/** Server components use the same client, with Next's revalidation window.
 *  A dead API must render as an honest failure state, never a 500 page. */
async function read<T>(path: string, revalidate = 10): Promise<T> {
  try {
    return await once<T>(path, undefined, { revalidate, timeoutMs: READ_TIMEOUT_MS })
  } catch (e) {
    if (!isRetryable(e, false)) throw e
    await sleep(RETRY_DELAY_MS)
    return once<T>(path, undefined, { revalidate, timeoutMs: READ_TIMEOUT_MS })
  }
}

/** Pull a suspended machine out of its snapshot while the reader is still on the
 *  first screen, so their first tap does not pay for the wake-up. Fire and forget:
 *  if it fails, the call it was warming retries on its own. `/ready` is the cheap
 *  probe on purpose — it does no chain read, so warming costs the indexer nothing. */
export function wake(): void {
  if (typeof window === "undefined") return
  void fetch(`${BASE}/v1/ready`, {
    cache: "no-store",
    keepalive: true,
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(() => {})
}

export const api = {
  base: BASE,
  getGoal: (id: string) => read<GoalDetail>(`/goals/${id}`, 5),
  getGoalFresh: (id: string) => call<GoalDetail>(`/goals/${id}`),
  listGoals: (owner: string) => call<{ goals: Goal[] }>(`/goals?owner=${encodeURIComponent(owner)}`),
  getStats: () => read<Stats>(`/stats`, 30),
  /** The published ledger: wallets, receipts and hashes, recounted by anyone. */
  getLedger: () => read<Ledger>(`/ledger`, 5),
  /** One receipt, by the hash the chain gave it. */
  getReceipt: (hash: string) => read<{ contribution: Contribution; goal: Goal }>(`/contributions/${hash}`, 5),
  /** Newest public jars, for the home page. Revalidated, since it is a server read. */
  recentGoals: () => read<{ goals: Goal[] }>(`/goals`, 20),
  createGoal: (input: {
    owner_address: string
    owner_token: string
    title: string
    story: string
    target_luna: string
    deadline: string
  }) => call<{ goal: Goal }>(`/goals`, { method: "POST", body: JSON.stringify(input) }),
  contribute: (id: string, input: { tx_hash: string; display_name?: string; note?: string }) =>
    call<{ contribution: Contribution; goal: Goal }>(`/goals/${id}/contributions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addThanks: (id: string, token: string, body: string) =>
    call<{ thanks: Thanks }>(`/goals/${id}/thanks`, {
      method: "POST",
      headers: { "x-owner-token": token },
      body: JSON.stringify({ body }),
    }),
  closeGoal: (id: string, token: string) =>
    call<{ goal: Goal }>(`/goals/${id}/close`, { method: "POST", headers: { "x-owner-token": token } }),
  /** Fix what you typed. The token buys editing, thanking and closing — never money. */
  editGoal: (
    id: string,
    token: string,
    patch: { title?: string; story?: string; target_luna?: string; deadline?: string },
  ) =>
    call<{ goal: Goal }>(`/goals/${id}/edit`, {
      method: "POST",
      headers: { "x-owner-token": token },
      body: JSON.stringify(patch),
    }),
}

/** The owner token lives only in this browser. Losing it loses thank-you rights,
 *  nothing else: funds are never controlled by it. */
export const ownerKey = (id: string) => `kitty:owner:${id}`
export const addressKey = "kitty:address"
