/**
 * v1/apportionments.js — Apportionment endpoints
 *
 * GET /v1/apportionments/:id    Full apportionment result with all party and
 *                               insurer breakdowns — ideal for reporting dashboards
 */

import { Router }    from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireScope } from '../../middleware/apiAuth.js'

const router = Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Get full apportionment result ─────────────────────────────────────────────
router.get('/:id', requireScope('read'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('la_apportionments')
      .select(`
        id, calculation_method, notes, calculated_at,
        matters:la_matters(id, matter_number, name),
        invoices:la_invoices(
          id, invoice_number, invoice_date, total_amount,
          billing_firm, service_start, service_end
        ),
        party_apportionments:la_party_apportionments(
          id, percentage, amount,
          parties:la_parties(id, name, type),
          insurer_apportionments:la_insurer_apportionments(
            id, days_on_risk, total_days, percentage, amount,
            override_pct, override_reason,
            payment_status, amount_paid, payment_date,
            insurers:la_insurers(id, name, policy_number),
            insurer_policy_periods:la_insurer_policy_periods(
              id, policy_start, policy_end, policy_limit,
              claim_number, claims_rep_name, claims_rep_email
            )
          )
        )
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Apportionment not found' })

    // Shape response into a clean summary
    const totalAmount = data.invoices?.total_amount || 0
    const summary = (data.party_apportionments || []).map(pa => ({
      party: {
        id:   pa.parties?.id,
        name: pa.parties?.name,
        type: pa.parties?.type,
      },
      percentage:    pa.percentage,
      amount:        pa.amount,
      insurers: (pa.insurer_apportionments || []).map(ia => {
        const effectivePct = ia.override_pct ?? ia.percentage
        const effectiveAmt = ia.override_pct != null
          ? (ia.override_pct / 100) * totalAmount
          : ia.amount
        return {
          id:              ia.id,
          insurer_name:    ia.insurers?.name,
          policy_number:   ia.insurers?.policy_number,
          claim_number:    ia.insurer_policy_periods?.claim_number,
          policy_period:   ia.insurer_policy_periods
            ? { start: ia.insurer_policy_periods.policy_start, end: ia.insurer_policy_periods.policy_end, limit: ia.insurer_policy_periods.policy_limit }
            : null,
          days_on_risk:    ia.days_on_risk,
          total_days:      ia.total_days,
          calculated_pct:  ia.percentage,
          effective_pct:   effectivePct,
          effective_amount: effectiveAmt,
          override_active: ia.override_pct != null,
          override_reason: ia.override_reason,
          payment: {
            status:     ia.payment_status,
            amount_paid: ia.amount_paid,
            date:        ia.payment_date,
          },
        }
      }),
    }))

    res.json({
      data: {
        id:                 data.id,
        calculation_method: data.calculation_method,
        notes:              data.notes,
        calculated_at:      data.calculated_at,
        matter:             data.matters,
        invoice: {
          id:            data.invoices?.id,
          invoice_number: data.invoices?.invoice_number,
          invoice_date:  data.invoices?.invoice_date,
          total_amount:  data.invoices?.total_amount,
          billing_firm:  data.invoices?.billing_firm,
          service_start: data.invoices?.service_start,
          service_end:   data.invoices?.service_end,
        },
        summary,
        totals: {
          invoice_total: totalAmount,
          party_count:   summary.length,
          insurer_count: summary.reduce((n, pa) => n + pa.insurers.length, 0),
        },
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
