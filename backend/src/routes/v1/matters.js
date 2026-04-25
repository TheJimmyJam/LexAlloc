/**
 * v1/matters.js — Matter endpoints
 *
 * GET  /v1/matters                   List matters for the org
 * GET  /v1/matters/:id               Get a matter with parties + insurers
 * GET  /v1/matters/:id/parties       List parties on a matter
 * GET  /v1/matters/:id/invoices      List invoices on a matter
 * POST /v1/matters/:id/invoices      Push a new invoice (triggers apportionment)
 * GET  /v1/matters/:id/apportionments List apportionments on a matter
 */

import { Router }    from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireScope } from '../../middleware/apiAuth.js'

const router = Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── List matters ──────────────────────────────────────────────────────────────
router.get('/', requireScope('read'), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query
    const offset = (parseInt(page) - 1) * Math.min(parseInt(limit), 100)

    let q = supabase
      .from('la_matters')
      .select('id, matter_number, name, description, status, is_template, created_at, updated_at', { count: 'exact' })
      .eq('org_id', req.orgId)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + Math.min(parseInt(limit), 100) - 1)

    if (status) q = q.eq('status', status)
    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error, count } = await q
    if (error) throw error

    res.json({
      data,
      meta: { total: count, page: parseInt(page), limit: Math.min(parseInt(limit), 100) },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get matter detail ─────────────────────────────────────────────────────────
router.get('/:id', requireScope('read'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('la_matters')
      .select(`
        id, matter_number, name, description, status, is_template, created_at, updated_at,
        la_parties(id, name, type, liability_percentage, notes),
        la_insurers(
          id, name, policy_number, org_id,
          la_insurer_policy_periods(
            id, policy_start, policy_end, policy_limit, deductible,
            claim_number, claims_rep_name, claims_rep_email
          )
        )
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Matter not found' })
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── List parties ──────────────────────────────────────────────────────────────
router.get('/:id/parties', requireScope('read'), async (req, res) => {
  try {
    const { data: matter } = await supabase
      .from('la_matters').select('id').eq('id', req.params.id).eq('org_id', req.orgId).single()
    if (!matter) return res.status(404).json({ error: 'Matter not found' })

    const { data, error } = await supabase
      .from('la_parties')
      .select('id, name, type, liability_percentage, notes, created_at')
      .eq('matter_id', req.params.id)
      .order('name')

    if (error) throw error
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── List invoices ─────────────────────────────────────────────────────────────
router.get('/:id/invoices', requireScope('read'), async (req, res) => {
  try {
    const { data: matter } = await supabase
      .from('la_matters').select('id').eq('id', req.params.id).eq('org_id', req.orgId).single()
    if (!matter) return res.status(404).json({ error: 'Matter not found' })

    const { data, error } = await supabase
      .from('la_invoices')
      .select('id, invoice_number, invoice_date, total_amount, billing_firm, service_start, service_end, status, created_at')
      .eq('matter_id', req.params.id)
      .order('invoice_date', { ascending: false })

    if (error) throw error
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Push a new invoice ────────────────────────────────────────────────────────
router.post('/:id/invoices', requireScope('write:invoices'), async (req, res) => {
  try {
    const { data: matter } = await supabase
      .from('la_matters').select('id, org_id').eq('id', req.params.id).eq('org_id', req.orgId).single()
    if (!matter) return res.status(404).json({ error: 'Matter not found' })

    const {
      invoice_number, invoice_date, total_amount, billing_firm,
      service_start, service_end, line_items = [],
    } = req.body

    if (!total_amount || isNaN(parseFloat(total_amount))) {
      return res.status(400).json({ error: 'total_amount is required and must be a number' })
    }

    const { data: invoice, error } = await supabase
      .from('la_invoices')
      .insert({
        matter_id:      req.params.id,
        org_id:         req.orgId,
        invoice_number: invoice_number || null,
        invoice_date:   invoice_date || new Date().toISOString().split('T')[0],
        total_amount:   parseFloat(total_amount),
        billing_firm:   billing_firm || null,
        service_start:  service_start || null,
        service_end:    service_end || null,
        source:         'api',
      })
      .select()
      .single()

    if (error) throw error

    // Insert line items if provided
    if (line_items.length > 0) {
      await supabase.from('la_invoice_line_items').insert(
        line_items.map(li => ({
          invoice_id:  invoice.id,
          description: li.description,
          quantity:    li.quantity || 1,
          unit_price:  li.unit_price || li.amount || 0,
          amount:      li.amount || (li.quantity || 1) * (li.unit_price || 0),
        }))
      )
    }

    res.status(201).json({ data: invoice, message: 'Invoice created. Run an apportionment from the LexAlloc UI or via the apportionments endpoint.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── List apportionments on a matter ──────────────────────────────────────────
router.get('/:id/apportionments', requireScope('read'), async (req, res) => {
  try {
    const { data: matter } = await supabase
      .from('la_matters').select('id').eq('id', req.params.id).eq('org_id', req.orgId).single()
    if (!matter) return res.status(404).json({ error: 'Matter not found' })

    const { data, error } = await supabase
      .from('la_apportionments')
      .select(`
        id, calculation_method, notes, calculated_at,
        invoices:la_invoices(id, invoice_number, invoice_date, total_amount)
      `)
      .eq('matter_id', req.params.id)
      .order('calculated_at', { ascending: false })

    if (error) throw error
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
