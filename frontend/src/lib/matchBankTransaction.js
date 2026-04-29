/**
 * Match a bank transaction to an outstanding insurer apportionment.
 *
 * Bank-agnostic: caller normalizes the transaction shape before passing it in.
 * No DB calls — pass the transaction and a list of candidate apportionments
 * (typically the org's unpaid `la_insurer_apportionments` rows) and get back
 * the best match plus a confidence score and the strategy that found it.
 *
 * Strategies, highest-confidence first:
 *
 *   exact_memo (100)            The lexalloc_invoice_number string is in the
 *                               memo, the description, or the counterparty name.
 *                               This is the strongest possible signal because
 *                               those numbers are issued by us and unique.
 *
 *   amount_insurer_date (90)    Amount matches exactly, the counterparty name
 *                               fuzzy-matches the insurer name, AND posted_at
 *                               is within ±60 days of the demand date.
 *
 *   amount_insurer_fuzzy (75)   Amount within ±$1 (round-off) AND counterparty
 *                               fuzzy-matches the insurer name. Date may be
 *                               anything — covers older outstanding demands.
 *
 *   amount_date (70)            Amount matches exactly AND within ±30 days of
 *                               demand date, but no counterparty match.
 *                               Probably the right payment but worth a quick
 *                               human review.
 *
 *   amount_only (50)            Only the amount matches. Lots of false
 *                               positives possible — flag for review.
 *
 * Below 50 → return null (treat as unmatched).
 *
 * The caller decides what to do with each confidence band:
 *   ≥ 90  → auto-attach, mark paid
 *   ≥ 70  → suggest a match, require one-click confirm
 *   50–69 → put in a "needs review" inbox
 *   null  → fully unmatched, manual reconciliation
 */

const ABS_AMOUNT_TOLERANCE_CENTS = 100        // $1 — round-off / fee tolerance
const DATE_WINDOW_DAYS_TIGHT     = 30
const DATE_WINDOW_DAYS_LOOSE     = 60

const DAY_MS = 24 * 60 * 60 * 1000

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalizeText(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Token-set similarity: 0..1. Used for fuzzy insurer-name matching against
// counterparty strings (which often contain extra words like "INC", "WIRE",
// "INCOMING", "INS CO", etc.).
function tokenOverlap(a, b) {
  const ta = new Set(normalizeText(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeText(b).split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let hits = 0
  for (const t of ta) if (tb.has(t)) hits++
  return hits / Math.min(ta.size, tb.size)   // ratio over the smaller set
}

function daysBetween(a, b) {
  if (!a || !b) return null
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.abs(da - db) / DAY_MS
}

function memoContainsLexNumber(memoBlobs, lexNumber) {
  if (!lexNumber) return false
  const target = String(lexNumber).toUpperCase().replace(/\s+/g, '')
  for (const blob of memoBlobs) {
    const blob_ = String(blob || '').toUpperCase().replace(/\s+/g, '')
    if (blob_.includes(target)) return true
  }
  return false
}


// ── Main matcher ─────────────────────────────────────────────────────────────
/**
 * @param {Object} txn — normalized bank transaction:
 *   { amount_cents, direction, posted_at, description, counterparty_name, raw_memo }
 *   direction must be 'credit' for the matcher to consider it (debits never pay
 *   us). amount_cents is positive.
 *
 * @param {Array<Object>} candidates — list of outstanding apportionments:
 *   {
 *     id, amount, amount_paid, balance_cents, lexalloc_invoice_number,
 *     demanded_at, payment_status,
 *     insurer_name, insurer_id,
 *     matter_id, matter_name,
 *   }
 *   `balance_cents` is what's still outstanding (amount - amount_paid). The
 *   matcher compares the txn amount to balance_cents (typical) but also
 *   accepts an exact match against the original `amount` for the case where
 *   a payer wires the full demanded amount despite a partial prior payment.
 *
 * @returns {{ apportionment_id, confidence, method, reasons } | null}
 */
export function matchBankTransaction(txn, candidates) {
  if (!txn || txn.direction !== 'credit')        return null
  if (!Array.isArray(candidates) || !candidates.length) return null
  if (!Number.isFinite(txn.amount_cents) || txn.amount_cents <= 0) return null

  const memoBlobs = [txn.raw_memo, txn.description, txn.counterparty_name]

  let best = null
  const consider = (cand, confidence, method, reasons) => {
    if (!best || confidence > best.confidence) {
      best = { apportionment_id: cand.id, confidence, method, reasons }
    }
  }

  for (const c of candidates) {
    if (c.payment_status === 'paid') continue
    const reasons = []

    const candAmountCents    = Math.round(Number(c.amount        || 0) * 100)
    const candBalanceCents   = Math.round(Number(c.balance_cents != null ? c.balance_cents
                                                : (Number(c.amount || 0) - Number(c.amount_paid || 0)) * 100))
    const amountExactBalance = Math.abs(txn.amount_cents - candBalanceCents) === 0
    const amountExactDemand  = Math.abs(txn.amount_cents - candAmountCents)  === 0
    const amountExact        = amountExactBalance || amountExactDemand
    const amountClose        = !amountExact &&
                                (Math.abs(txn.amount_cents - candBalanceCents) <= ABS_AMOUNT_TOLERANCE_CENTS ||
                                 Math.abs(txn.amount_cents - candAmountCents)  <= ABS_AMOUNT_TOLERANCE_CENTS)

    // ── Exact memo wins everything else ─────────────────────────────────────
    if (memoContainsLexNumber(memoBlobs, c.lexalloc_invoice_number)) {
      reasons.push(`memo contains "${c.lexalloc_invoice_number}"`)
      // Penalize if amounts don't match — likely a misposted reference.
      if (amountExact)        consider(c, 100, 'exact_memo', [...reasons, 'amount matches exactly'])
      else if (amountClose)   consider(c,  95, 'exact_memo', [...reasons, 'amount within rounding'])
      else                    consider(c,  85, 'exact_memo', [...reasons, 'amount differs — review'])
      continue
    }

    // ── Counterparty/insurer fuzzy match ───────────────────────────────────
    const insurerSim = tokenOverlap(c.insurer_name, txn.counterparty_name)
    const insurerHit = insurerSim >= 0.5
    if (insurerHit) reasons.push(`counterparty matches "${c.insurer_name}" (sim ${insurerSim.toFixed(2)})`)

    // ── Date proximity ────────────────────────────────────────────────────
    const dDays = daysBetween(txn.posted_at, c.demanded_at)
    const dateTight = dDays != null && dDays <= DATE_WINDOW_DAYS_TIGHT
    const dateLoose = dDays != null && dDays <= DATE_WINDOW_DAYS_LOOSE
    if (dateTight)      reasons.push(`posted ${Math.round(dDays)}d after demand`)
    else if (dateLoose) reasons.push(`posted ${Math.round(dDays)}d after demand (loose)`)

    // ── Combine signals ────────────────────────────────────────────────────
    if (amountExact && insurerHit && dateLoose)        consider(c, 90, 'amount_insurer_date',  reasons)
    else if (amountClose && insurerHit)                consider(c, 75, 'amount_insurer_fuzzy', reasons)
    else if (amountExact && dateTight)                 consider(c, 70, 'amount_date',          reasons)
    else if (amountExact && insurerHit)                consider(c, 70, 'amount_insurer_fuzzy', reasons)
    else if (amountExact)                              consider(c, 50, 'amount_only',          [...reasons, 'amount matches; no other signal'])
  }

  return best && best.confidence >= 50 ? best : null
}


// ── Bulk variant ─────────────────────────────────────────────────────────────
/**
 * Run the matcher across a batch of transactions in one call. Useful when
 * a webhook delivers a backlog or after a Plaid sync.
 *
 * Returns an array of { txn, match } pairs.
 */
export function matchBankTransactions(txns, candidates) {
  return (txns || []).map(txn => ({
    txn,
    match: matchBankTransaction(txn, candidates),
  }))
}


// ── Confidence band helper ───────────────────────────────────────────────────
// UI-side classifier so the reconciliation screen can color-code suggestions.
export function confidenceBand(confidence) {
  if (confidence == null)  return { key: 'none',     label: 'Unmatched',          cls: 'bg-slate-100 text-slate-500' }
  if (confidence >= 90)    return { key: 'high',     label: 'Auto-match',         cls: 'bg-green-100 text-green-700' }
  if (confidence >= 70)    return { key: 'medium',   label: 'Suggested',          cls: 'bg-amber-100 text-amber-700' }
  if (confidence >= 50)    return { key: 'low',      label: 'Needs review',       cls: 'bg-orange-100 text-orange-700' }
  return                          { key: 'none',     label: 'Unmatched',          cls: 'bg-slate-100 text-slate-500' }
}
