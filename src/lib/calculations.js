import { differenceInCalendarDays, parseISO, max, min } from 'date-fns'

export function calcTimeOnRisk(exposureStart, exposureEnd, policyPeriods) {
  const totalDays = Math.max(1, differenceInCalendarDays(exposureEnd, exposureStart))
  return policyPeriods.map(pp => {
    const pStart = typeof pp.policy_start === 'string' ? parseISO(pp.policy_start) : pp.policy_start
    const pEnd   = typeof pp.policy_end   === 'string' ? parseISO(pp.policy_end)   : pp.policy_end
    const overlapStart = max([exposureStart, pStart])
    const overlapEnd   = min([exposureEnd, pEnd])
    const daysOnRisk   = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart))
    return { ...pp, days_on_risk: daysOnRisk, total_exposure_days: totalDays, percentage: (daysOnRisk / totalDays) * 100 }
  })
}

export function apportionInvoice(invoice, parties) {
  const serviceStart = parseISO(invoice.service_start)
  const serviceEnd   = parseISO(invoice.service_end || invoice.service_start)
  return parties.map(party => {
    const partyAmount = (party.share_percentage / 100) * invoice.total_amount
    const insurerBreakdown = calcTimeOnRisk(serviceStart, serviceEnd, party.policy_periods || [])
    const totalPct = insurerBreakdown.reduce((s, i) => s + i.percentage, 0)
    const insurers = insurerBreakdown.map(ins => ({
      ...ins,
      amount: (ins.percentage / (totalPct || 100)) * partyAmount,
      normalized_percentage: totalPct > 0 ? (ins.percentage / totalPct) * 100 : 0,
    }))
    return { party_id: party.id, party_name: party.name, share_percentage: party.share_percentage, party_amount: partyAmount, insurers, uninsured_amount: Math.max(0, partyAmount - insurers.reduce((s,i)=>s+i.amount,0)) }
  })
}

export const formatCurrency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
export const formatPercent  = (v) => `${(v || 0).toFixed(2)}%`
