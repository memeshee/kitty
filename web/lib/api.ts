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

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    })
  } catch {
    throw new ApiError("network", "Can't reach Kitty right now. Check your connection and try again.", 0)
  }
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const e = body?.error ?? {}
    throw new ApiError(e.code ?? "unknown", e.message ?? "Something went wrong.", res.status)
  }
  return body as T
}

/** Server components use the same client, with Next's revalidation window.
 *  A dead API must render as an honest failure state, never a 500 page. */
async function read<T>(path: string, revalidate = 10): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/v1${path}`, { next: { revalidate } })
  } catch {
    throw new ApiError("network", "Kitty's index is unreachable right now.", 0)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const e = body?.error ?? {}
    throw new ApiError(e.code ?? "unknown", e.message ?? "Something went wrong.", res.status)
  }
  return (await res.json()) as T
}

export const api = {
  base: BASE,
  getGoal: (id: string) => read<GoalDetail>(`/goals/${id}`, 5),
  getGoalFresh: (id: string) => call<GoalDetail>(`/goals/${id}`),
  listGoals: (owner: string) => call<{ goals: Goal[] }>(`/goals?owner=${encodeURIComponent(owner)}`),
  getStats: () => read<Stats>(`/stats`, 30),
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
}

/** The owner token lives only in this browser. Losing it loses thank-you rights,
 *  nothing else: funds are never controlled by it. */
export const ownerKey = (id: string) => `kitty:owner:${id}`
export const addressKey = "kitty:address"
