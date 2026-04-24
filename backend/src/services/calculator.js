import { differenceInCalendarDays, parseISO, max, min } from 'date-fns'

/**
 * Server-side pro-rata time-on-risk calculation.
 * Mirrors the frontend calculations.js for API-driven use.
 */
export function calcTimeOnRisk(invoice, parties) {
  const serviceStart = parseISO(invoice.service_start)
  const serviceEnd   = parseISO(invoice.service_end || invoice.service_start)
  const totalDays    = Math.max(1, differenceInCalendarDays(serviceEnd, serviceStart))

  const partyBreakdown = parties.map(party => {
    const partyAmount = (party.share_percentage / 100) * invoice.total_amount

    const insurers = (party.policy_periods || []).map(pp => {
      const pStart     = parseISO(pp.policy_start)
      const pEnd       = parseISO(pp.policy_end)
      const overlapStart = max([serviceStart, pStart])
      const overlapEnd   = min([serviceEnd,   pEnd])
      const daysOnRisk   = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart))
      const pct          = (daysOnRisk / totalDays) * 100

      return {
        insurer_id:          pp.insurer_id,
        insurer_name:        pp.insurer_name,
        policy_start:        pp.policy_start,
        policy_end:          pp.policy_end,
        days_on_risk:        daysOnRisk,
        total_exposure_days: totalDays,
        percentage:          pct,
        amount:              (pct / 100) * partyAmount,
      }
    })

    const totalInsPct = insurers.reduce((s, i) => s + i.percentage, 0)
    const normalized  = insurers.map(i => ({
      ...i,
      normalized_percentage: totalInsPct > 0 ? (i.percentage / totalInsPct) * 100 : 0,
    }))

    return {
      party_id:          party.id,
      party_name:        party.name,
      share_percentage:  party.share_percentage,
      party_amount:      partyAmount,
      insurers:          normalized,
      uninsured_amount:  partyAmount - normalized.reduce((s, i) => s + i.amount, 0),
    }
  })

  return {
    invoice_total:   invoice.total_amount,
    service_start:   invoice.service_start,
    service_end:     invoice.service_end || invoice.service_start,
    total_exposure_days: totalDays,
    party_breakdown: partyBreakdown,
    calculated_at:   new Date().toISOString(),
    method:          'pro_rata_time_on_risk',
  }
}
