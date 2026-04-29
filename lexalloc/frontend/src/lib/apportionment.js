/**
 * Shared apportionment utilities — used by InvoiceDetail (manual run) and
 * InvoiceUploadModal (auto-run when matter has a default method set).
 */

import { differenceInCalendarDays, parseISO } from 'date-fns'
import { apportionInvoice } from './calculations.js'
import { supabase } from './supabase.js'

export const APPORTIONMENT_METHODS = [
  {
    value:       'pro_rata_time_on_risk',
    label:       'Pro-Rata TOR',
    description: 'Days each policy was on-risk during the service period',
  },
  {
    value:       'equal_shares',
    label:       'Equal Shares',
    description: 'Splits costs evenly across all carriers for each party',
  },
  {
    value:       'limits_proportional',
    label:       'Limits-Proportional',
    description: "Weighted by each policy's limit",
  },
]

/**
 * Build the partiesWithPolicies array needed by apportionInvoice().
 * Filters out parties whose responsible date range doesn't overlap the invoice period.
 * Normalises share percentages across included parties.
 */
export function buildPartiesWithPolicies(parties, insurerPeriods, invoice) {
  const allPolicies = (party) =>
    insurerPeriods
      .filter(pp => pp.party_id === party.id)
      .map(pp => ({
        ...pp,
        insurer_name: pp.la_insurers?.name || pp.insurers?.name,
        policy_limit: pp.policy_limit,
      }))

  if (!invoice?.service_start) return { partiesWithPolicies: [], excludedParties: [] }

  const invoiceStart     = parseISO(invoice.service_start)
  const invoiceEnd       = invoice.service_end ? parseISO(invoice.service_end) : invoiceStart
  const totalServiceDays = Math.max(1, differenceInCalendarDays(invoiceEnd, invoiceStart))

  const calcOverlapDays = (party) => {
    if (!party.responsible_start && !party.responsible_end) return totalServiceDays
    const pStart = party.responsible_start ? parseISO(party.responsible_start) : invoiceStart
    const pEnd   = party.responsible_end   ? parseISO(party.responsible_end)   : invoiceEnd
    const oStart = pStart > invoiceStart ? pStart : invoiceStart
    const oEnd   = pEnd   < invoiceEnd   ? pEnd   : invoiceEnd
    return Math.max(0, differenceInCalendarDays(oEnd, oStart))
  }

  const withDays  = parties.map(p => ({ ...p, _overlapDays: calcOverlapDays(p) }))
  const included  = withDays.filter(p => p._overlapDays > 0)
  const excluded  = withDays.filter(p => p._overlapDays === 0)
  const totalDays = included.reduce((s, p) => s + p._overlapDays, 0) || 1

  const partiesWithPolicies = included.map(p => ({
    ...p,
    share_percentage: parseFloat(((p._overlapDays / totalDays) * 100).toFixed(4)),
    policy_periods:   allPolicies(p),
  }))

  return { partiesWithPolicies, excludedParties: excluded }
}

/**
 * Full apportionment run: calculate + write all DB records + flip invoice status.
 * Returns true on success, false on failure (does not throw).
 *
 * @param {{ invoice, invoiceId, matterId, orgId, profile, partiesWithPolicies, method }} params
 */
export async function saveApportionmentToDb({ invoice, invoiceId, matterId, orgId, profile, partiesWithPolicies, method }) {
  try {
    if (!partiesWithPolicies.length) return false
    if (!invoice?.service_start)    return false

    const result      = apportionInvoice(invoice, partiesWithPolicies, method)
    const methodLabel = APPORTIONMENT_METHODS.find(m => m.value === method)?.label || method

    const { data: apport, error: aErr } = await supabase.from('la_apportionments').insert({
      invoice_id:         invoiceId,
      matter_id:          matterId,
      org_id:             orgId,
      calculation_method: method,
      result_json:        result,
      calculated_at:      new Date().toISOString(),
      notes:              `Auto-calculated: ${methodLabel}`,
    }).select().single()
    if (aErr) throw aErr

    for (const pb of result.party_breakdown) {
      const { data: pa, error: paErr } = await supabase.from('la_party_apportionments').insert({
        apportionment_id: apport.id,
        party_id:         pb.party_id,
        percentage:       pb.share_percentage,
        amount:           pb.party_amount,
      }).select().single()
      if (paErr) throw paErr

      for (const ins of pb.insurers) {
        await supabase.from('la_insurer_apportionments').insert({
          apportionment_id:       apport.id,
          party_apportionment_id: pa.id,
          insurer_id:             ins.insurer_id,
          days_on_risk:           ins.days_on_risk          ?? null,
          total_days:             ins.total_coverage_days   ?? null,
          percentage:             ins.normalized_percentage,
          amount:                 ins.amount,
        })
      }
    }

    await supabase.from('la_invoices').update({ status: 'apportioned' }).eq('id', invoiceId)

    return apport.id
  } catch {
    return false
  }
}

/**
 * Full auto-apportionment pipeline:
 * fetch parties + insurer periods → build → calculate → save.
 * Safe to call fire-and-forget — returns false on any failure.
 */
export async function autoApportion({ invoiceId, invoice, matterId, orgId, profile, method }) {
  try {
    const [{ data: parties }, { data: insurerPeriods }] = await Promise.all([
      supabase.from('la_parties').select('*').eq('matter_id', matterId),
      supabase.from('la_insurer_policy_periods').select('*, la_insurers(name)').eq('matter_id', matterId),
    ])

    if (!parties?.length) return false

    const { partiesWithPolicies } = buildPartiesWithPolicies(parties, insurerPeriods || [], invoice)
    if (!partiesWithPolicies.length) return false

    return await saveApportionmentToDb({
      invoice, invoiceId, matterId, orgId, profile, partiesWithPolicies, method,
    })
  } catch {
    return false
  }
}
