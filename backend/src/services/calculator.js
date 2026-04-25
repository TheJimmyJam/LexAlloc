import { differenceInCalendarDays, parseISO } from 'date-fns'

/**
 * Server-side apportionment calculation.
 * Mirrors frontend calculations.js for API-driven use.
 *
 * Party shares are pre-set on each party object (share_percentage).
 * Insurer TOR = insurer policy duration / sum of all policy durations for that party.
 * No reference to invoice service dates for insurer allocation.
 */
export function calcTimeOnRisk(invoice, parties) {
  const breakdown = parties.map(party => {
    const partyAmount = (party.share_percentage / 100) * invoice.total_amount
    const today       = new Date()

    const withDays = (party.policy_periods || []).map(pp => {
      const pStart = parseISO(pp.policy_start)
      // null policy_end = still in effect; use today as ceiling
      const pEnd   = pp.policy_end ? parseISO(pp.policy_end) : today
      const days   = Math.max(1, differenceInCalendarDays(pEnd, pStart))

      return {
        insurer_id:   pp.insurer_id,
        insurer_name: pp.insurer_name,
        policy_start: pp.policy_start,
        policy_end:   pp.policy_end,
        days_on_risk: days,
      }
    })

    const totalDays = withDays.reduce((s, i) => s + i.days_on_risk, 0) || 1

    const insurers = withDays.map(i => ({
      ...i,
      total_coverage_days:   totalDays,
      percentage:            (i.days_on_risk / totalDays) * 100,
      normalized_percentage: (i.days_on_risk / totalDays) * 100,
      amount:                (i.days_on_risk / totalDays) * partyAmount,
    }))

    return {
      party_id:          party.id,
      party_name:        party.name,
      share_percentage:  party.share_percentage,
      party_amount:      partyAmount,
      insurers,
      uninsured_amount:  Math.max(0, partyAmount - insurers.reduce((s, i) => s + i.amount, 0)),
    }
  })

  return {
    invoice_total:      invoice.total_amount,
    service_start:      invoice.service_start,
    service_end:        invoice.service_end || invoice.service_start,
    party_breakdown:    breakdown,
    calculated_at:      new Date().toISOString(),
    method:             'pro_rata_time_on_risk',
  }
}
