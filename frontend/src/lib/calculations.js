import { differenceInCalendarDays, parseISO } from 'date-fns'

/**
 * Pro-rata time-on-risk for each insurer under a single party.
 *
 * TOR = insurer's raw policy duration / sum of all insurer policy durations for this party.
 * No reference to invoice service dates — this is purely about coverage period length.
 * Policies with no end date (still in effect) use today as the ceiling.
 *
 * @param {Array} policyPeriods - [{ insurer_id, insurer_name, policy_start, policy_end }]
 * @returns {Array} [{ insurer_id, insurer_name, days_on_risk, total_coverage_days, percentage }]
 */
export function calcTimeOnRisk(policyPeriods) {
  const today = new Date()

  const withDays = policyPeriods.map((pp) => {
    const pStart = typeof pp.policy_start === 'string' ? parseISO(pp.policy_start) : pp.policy_start
    const pEnd   = pp.policy_end
      ? (typeof pp.policy_end === 'string' ? parseISO(pp.policy_end) : pp.policy_end)
      : today

    const days = Math.max(1, differenceInCalendarDays(pEnd, pStart))

    return {
      insurer_id:   pp.insurer_id,
      insurer_name: pp.insurer_name,
      policy_start: pp.policy_start,
      policy_end:   pp.policy_end,
      days_on_risk: days,
    }
  })

  const totalDays = withDays.reduce((s, r) => s + r.days_on_risk, 0) || 1

  return withDays.map(r => ({
    ...r,
    total_coverage_days: totalDays,
    percentage: (r.days_on_risk / totalDays) * 100,
  }))
}

/**
 * Equal shares: split party amount evenly across all insurers.
 *
 * @param {number} partyAmount   - Dollar amount allocated to this party
 * @param {Array}  policyPeriods - [{ insurer_id, insurer_name, ... }]
 * @returns {Array} insurer breakdown with equal percentages
 */
export function calcEqualShares(partyAmount, policyPeriods) {
  const n = policyPeriods.length
  if (n === 0) return []
  const share = 100 / n

  return policyPeriods.map((pp) => ({
    insurer_id:            pp.insurer_id,
    insurer_name:          pp.insurer_name,
    policy_start:          pp.policy_start,
    policy_end:            pp.policy_end,
    days_on_risk:          null,
    total_coverage_days:   null,
    percentage:            share,
    amount:                (share / 100) * partyAmount,
    normalized_percentage: share,
  }))
}

/**
 * Limits-proportional: each insurer's share = their policy_limit / sum of all limits.
 * Falls back to equal shares if no limits are set.
 *
 * @param {number} partyAmount   - Dollar amount allocated to this party
 * @param {Array}  policyPeriods - [{ insurer_id, insurer_name, policy_limit, ... }]
 * @returns {Array} insurer breakdown weighted by policy limits
 */
export function calcLimitsProportional(partyAmount, policyPeriods) {
  const totalLimits = policyPeriods.reduce((s, pp) => s + (Number(pp.policy_limit) || 0), 0)

  if (totalLimits === 0) return calcEqualShares(partyAmount, policyPeriods)

  return policyPeriods.map((pp) => {
    const limit = Number(pp.policy_limit) || 0
    const pct   = (limit / totalLimits) * 100
    return {
      insurer_id:            pp.insurer_id,
      insurer_name:          pp.insurer_name,
      policy_start:          pp.policy_start,
      policy_end:            pp.policy_end,
      days_on_risk:          null,
      total_coverage_days:   null,
      percentage:            pct,
      amount:                (pct / 100) * partyAmount,
      normalized_percentage: pct,
    }
  })
}

/**
 * Apportion an invoice across parties and their insurers.
 *
 * Party shares must already be set on each party object (share_percentage).
 * Insurer allocation within each party uses the selected method:
 *   - pro_rata_time_on_risk: insurer policy duration / total policy duration for this party
 *   - equal_shares: split evenly across all insurers
 *   - limits_proportional: weighted by policy limit
 *
 * @param {Object} invoice  - { total_amount, service_start, service_end }
 * @param {Array}  parties  - [{ id, name, share_percentage, policy_periods: [...] }]
 * @param {string} method   - 'pro_rata_time_on_risk' | 'equal_shares' | 'limits_proportional'
 * @returns {Object} Detailed apportionment breakdown
 */
export function apportionInvoice(invoice, parties, method = 'pro_rata_time_on_risk') {
  const breakdown = parties.map((party) => {
    const partyAmount = (party.share_percentage / 100) * invoice.total_amount
    const periods     = party.policy_periods || []

    let insurers
    if (method === 'equal_shares') {
      insurers = calcEqualShares(partyAmount, periods)
    } else if (method === 'limits_proportional') {
      insurers = calcLimitsProportional(partyAmount, periods)
    } else {
      // pro_rata_time_on_risk: insurer share = policy_duration / sum of all policy durations
      const torBreakdown = calcTimeOnRisk(periods)
      insurers = torBreakdown.map((ins) => ({
        ...ins,
        amount:                (ins.percentage / 100) * partyAmount,
        normalized_percentage: ins.percentage,
      }))
    }

    const uninsuredAmount = partyAmount - insurers.reduce((s, i) => s + i.amount, 0)

    return {
      party_id:         party.id,
      party_name:       party.name,
      share_percentage: party.share_percentage,
      party_amount:     partyAmount,
      insurers,
      uninsured_amount: Math.max(0, uninsuredAmount),
    }
  })

  return {
    invoice_total:      invoice.total_amount,
    service_start:      invoice.service_start,
    service_end:        invoice.service_end || invoice.service_start,
    calculation_method: method,
    party_breakdown:    breakdown,
    calculated_at:      new Date().toISOString(),
  }
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

export function formatPercent(pct) {
  return `${(pct || 0).toFixed(2)}%`
}

/**
 * Returns color/label metadata for a policy limit exhaustion percentage.
 * Thresholds: 70% = Warning, 90% = Near Limit, 100%+ = Exhausted
 */
export function exhaustionInfo(pct) {
  if (pct >= 100) return { color: 'text-red-700',    barColor: 'bg-red-500',    badge: 'bg-red-100 text-red-700',       label: 'Exhausted'  }
  if (pct >= 90)  return { color: 'text-orange-700', barColor: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', label: 'Near Limit' }
  if (pct >= 70)  return { color: 'text-amber-700',  barColor: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700',  label: 'Warning'    }
  return               { color: 'text-green-700',  barColor: 'bg-green-500',  badge: 'bg-green-100 text-green-700',  label: 'OK'         }
}
