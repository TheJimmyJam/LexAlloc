import { differenceInCalendarDays, parseISO, isWithinInterval, max, min } from 'date-fns'

/**
 * Calculate pro-rata time-on-risk percentage for each insurer
 * for a given date range (e.g., invoice date or service period).
 *
 * @param {Date} exposureStart - Start of exposure period
 * @param {Date} exposureEnd   - End of exposure period
 * @param {Array} policyPeriods - [{ id, insurer_id, insurer_name, policy_start, policy_end }]
 * @returns {Array} [{ insurer_id, insurer_name, days_on_risk, total_exposure_days, percentage }]
 */
export function calcTimeOnRisk(exposureStart, exposureEnd, policyPeriods) {
  const totalDays = differenceInCalendarDays(exposureEnd, exposureStart) || 1

  const results = policyPeriods.map((pp) => {
    const pStart = typeof pp.policy_start === 'string' ? parseISO(pp.policy_start) : pp.policy_start
    const pEnd   = typeof pp.policy_end   === 'string' ? parseISO(pp.policy_end)   : pp.policy_end

    // Overlap window
    const overlapStart = max([exposureStart, pStart])
    const overlapEnd   = min([exposureEnd, pEnd])
    const daysOnRisk   = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart))

    return {
      insurer_id:     pp.insurer_id,
      insurer_name:   pp.insurer_name,
      policy_start:   pp.policy_start,
      policy_end:     pp.policy_end,
      days_on_risk:   daysOnRisk,
      total_exposure_days: totalDays,
      percentage:     totalDays > 0 ? (daysOnRisk / totalDays) * 100 : 0,
    }
  })

  return results
}

/**
 * Apportion an invoice across parties and their insurers.
 *
 * @param {Object} invoice - { total_amount, line_items: [...], service_start, service_end }
 * @param {Array}  parties - [{ id, name, share_percentage, policy_periods: [...] }]
 * @returns {Object} Detailed apportionment breakdown
 */
export function apportionInvoice(invoice, parties) {
  const serviceStart = parseISO(invoice.service_start)
  const serviceEnd   = parseISO(invoice.service_end || invoice.service_start)

  const breakdown = parties.map((party) => {
    const partyAmount = (party.share_percentage / 100) * invoice.total_amount

    const insurerBreakdown = calcTimeOnRisk(serviceStart, serviceEnd, party.policy_periods || [])
    const totalPct = insurerBreakdown.reduce((s, i) => s + i.percentage, 0)

    const insurers = insurerBreakdown.map((ins) => ({
      ...ins,
      amount: (ins.percentage / (totalPct || 100)) * partyAmount,
      normalized_percentage: totalPct > 0 ? (ins.percentage / totalPct) * 100 : 0,
    }))

    const uninsuredAmount = partyAmount - insurers.reduce((s, i) => s + i.amount, 0)

    return {
      party_id:          party.id,
      party_name:        party.name,
      share_percentage:  party.share_percentage,
      party_amount:      partyAmount,
      insurers,
      uninsured_amount:  Math.max(0, uninsuredAmount),
    }
  })

  return {
    invoice_total:  invoice.total_amount,
    service_start:  invoice.service_start,
    service_end:    invoice.service_end || invoice.service_start,
    party_breakdown: breakdown,
    calculated_at:  new Date().toISOString(),
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
