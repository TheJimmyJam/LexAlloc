import { v4 as uuid } from 'uuid'

// ── Seed data ─────────────────────────────────────────────────────────────────
const ORG_ID      = 'org-demo-001'
const MATTER_1    = 'matter-001'
const MATTER_2    = 'matter-002'
const PARTY_A     = 'party-a'   // Pacific Industries (60%)
const PARTY_B     = 'party-b'   // Omega Contractors (30%)
const PARTY_C     = 'party-c'   // Regent Supply Co (10%)
const INS_1       = 'ins-1'     // Travelers (covers Party A: 2018–2020)
const INS_2       = 'ins-2'     // Hartford  (covers Party A: 2020–2022)
const INS_3       = 'ins-3'     // Zurich    (covers Party B: 2018–2022)
const INS_4       = 'ins-4'     // Chubb     (covers Party C: 2019–2021)
const PP_1        = 'pp-1'
const PP_2        = 'pp-2'
const PP_3        = 'pp-3'
const PP_4        = 'pp-4'
const INV_1       = 'inv-001'
const INV_2       = 'inv-002'
const APP_1       = 'app-001'

const SEED = {
  organizations: [
    { id: ORG_ID, name: 'Smith & Associates LLP', created_at: '2024-01-10T09:00:00Z' }
  ],
  profiles: [
    { id: 'user-admin', org_id: ORG_ID, role: 'admin', first_name: 'Jimmy', last_name: 'Cannon', email: 'admin@lexalloc.demo', created_at: '2024-01-10T09:00:00Z', organizations: { id: ORG_ID, name: 'Smith & Associates LLP' } },
    { id: 'user-client', org_id: ORG_ID, role: 'client', first_name: 'Sarah', last_name: 'Mitchell', email: 'client@lexalloc.demo', created_at: '2024-02-01T09:00:00Z', organizations: { id: ORG_ID, name: 'Smith & Associates LLP' } },
    { id: 'user-atty', org_id: ORG_ID, role: 'user', first_name: 'Marcus', last_name: 'Reid', email: 'user@lexalloc.demo', created_at: '2024-02-15T09:00:00Z', organizations: { id: ORG_ID, name: 'Smith & Associates LLP' } },
  ],
  matters: [
    {
      id: MATTER_1, org_id: ORG_ID, name: 'Johnson v. Pacific Industries et al.',
      matter_number: '2021-CV-04471', description: 'Products liability — industrial crane failure causing personal injury at Dallas job site.',
      status: 'active', created_by: 'user-admin', created_at: '2024-01-15T10:00:00Z'
    },
    {
      id: MATTER_2, org_id: ORG_ID, name: 'Torres Construction Defect',
      matter_number: '2022-CV-00892', description: 'Construction defect — water intrusion and structural damage, multi-party residential development.',
      status: 'active', created_by: 'user-admin', created_at: '2024-02-20T10:00:00Z'
    }
  ],
  parties: [
    { id: PARTY_A, matter_id: MATTER_1, org_id: ORG_ID, name: 'Pacific Industries Inc.', type: 'defendant', share_percentage: 60, notes: 'Primary manufacturer — crane design defect', created_at: '2024-01-16T10:00:00Z' },
    { id: PARTY_B, matter_id: MATTER_1, org_id: ORG_ID, name: 'Omega Contractors LLC', type: 'defendant', share_percentage: 30, notes: 'Installation and maintenance contractor', created_at: '2024-01-16T10:30:00Z' },
    { id: PARTY_C, matter_id: MATTER_1, org_id: ORG_ID, name: 'Regent Supply Co.', type: 'third_party', share_percentage: 10, notes: 'Component supplier — hydraulic fittings', created_at: '2024-01-16T11:00:00Z' },
  ],
  insurers: [
    { id: INS_1, org_id: ORG_ID, name: 'Travelers Indemnity Co.', policy_number: 'GL-TRV-2018-88801', contact_email: 'claims@travelers.com', created_at: '2024-01-17T09:00:00Z' },
    { id: INS_2, org_id: ORG_ID, name: 'Hartford Fire Insurance', policy_number: 'GL-HFI-2020-33291', contact_email: 'claims@hartford.com', created_at: '2024-01-17T09:30:00Z' },
    { id: INS_3, org_id: ORG_ID, name: 'Zurich American Insurance', policy_number: 'GL-ZAI-2018-55120', contact_email: 'claims@zurich.com', created_at: '2024-01-17T10:00:00Z' },
    { id: INS_4, org_id: ORG_ID, name: 'Chubb Group Holdings', policy_number: 'GL-CHB-2019-77743', contact_email: 'claims@chubb.com', created_at: '2024-01-17T10:30:00Z' },
  ],
  insurer_policy_periods: [
    // Pacific Industries: Travelers 2018–2020, Hartford 2020–2022
    { id: PP_1, insurer_id: INS_1, party_id: PARTY_A, matter_id: MATTER_1, org_id: ORG_ID, policy_start: '2018-01-01', policy_end: '2020-12-31', policy_limit: 2000000, deductible: 50000, created_at: '2024-01-17T09:00:00Z', insurers: { name: 'Travelers Indemnity Co.', policy_number: 'GL-TRV-2018-88801' }, parties: { name: 'Pacific Industries Inc.' } },
    { id: PP_2, insurer_id: INS_2, party_id: PARTY_A, matter_id: MATTER_1, org_id: ORG_ID, policy_start: '2021-01-01', policy_end: '2022-12-31', policy_limit: 5000000, deductible: 100000, created_at: '2024-01-17T09:30:00Z', insurers: { name: 'Hartford Fire Insurance', policy_number: 'GL-HFI-2020-33291' }, parties: { name: 'Pacific Industries Inc.' } },
    // Omega: Zurich 2018–2022
    { id: PP_3, insurer_id: INS_3, party_id: PARTY_B, matter_id: MATTER_1, org_id: ORG_ID, policy_start: '2018-06-01', policy_end: '2022-05-31', policy_limit: 1000000, deductible: 25000, created_at: '2024-01-17T10:00:00Z', insurers: { name: 'Zurich American Insurance', policy_number: 'GL-ZAI-2018-55120' }, parties: { name: 'Omega Contractors LLC' } },
    // Regent: Chubb 2019–2021
    { id: PP_4, insurer_id: INS_4, party_id: PARTY_C, matter_id: MATTER_1, org_id: ORG_ID, policy_start: '2019-03-01', policy_end: '2021-02-28', policy_limit: 500000, deductible: 10000, created_at: '2024-01-17T10:30:00Z', insurers: { name: 'Chubb Group Holdings', policy_number: 'GL-CHB-2019-77743' }, parties: { name: 'Regent Supply Co.' } },
  ],
  invoices: [
    {
      id: INV_1, matter_id: MATTER_1, org_id: ORG_ID, file_url: null,
      invoice_number: 'WB-2021-0047', invoice_date: '2021-09-30',
      billing_firm: 'Wilson Burgess LLP', total_amount: 48750.00,
      service_start: '2021-01-01', service_end: '2021-12-31',
      status: 'apportioned', created_at: '2024-01-20T10:00:00Z'
    },
    {
      id: INV_2, matter_id: MATTER_1, org_id: ORG_ID, file_url: null,
      invoice_number: 'WB-2022-0011', invoice_date: '2022-03-31',
      billing_firm: 'Wilson Burgess LLP', total_amount: 22400.00,
      service_start: '2022-01-01', service_end: '2022-03-31',
      status: 'parsed', created_at: '2024-02-01T10:00:00Z'
    }
  ],
  invoice_line_items: [
    // Invoice 1 line items
    { id: 'li-001', invoice_id: INV_1, date_of_service: '2021-01-12', description: 'Review pleadings and case file; analyze liability exposure', timekeeper: 'M. Reid', hours: 4.5, rate: 450, amount: 2025.00, category: 'fees' },
    { id: 'li-002', invoice_id: INV_1, date_of_service: '2021-01-19', description: 'Conference call with co-counsel re: coverage issues and defense strategy', timekeeper: 'M. Reid', hours: 2.0, rate: 450, amount: 900.00, category: 'fees' },
    { id: 'li-003', invoice_id: INV_1, date_of_service: '2021-02-08', description: 'Draft answer to complaint; research statute of limitations', timekeeper: 'J. Park', hours: 6.5, rate: 350, amount: 2275.00, category: 'fees' },
    { id: 'li-004', invoice_id: INV_1, date_of_service: '2021-02-22', description: 'Prepare initial disclosures; review crane inspection reports', timekeeper: 'M. Reid', hours: 5.0, rate: 450, amount: 2250.00, category: 'fees' },
    { id: 'li-005', invoice_id: INV_1, date_of_service: '2021-03-15', description: 'Deposition of plaintiff Thomas Johnson — preparation and attendance', timekeeper: 'M. Reid', hours: 8.0, rate: 450, amount: 3600.00, category: 'fees' },
    { id: 'li-006', invoice_id: INV_1, date_of_service: '2021-03-15', description: 'Court reporter fee — Johnson deposition', timekeeper: null, hours: null, rate: null, amount: 875.00, category: 'costs' },
    { id: 'li-007', invoice_id: INV_1, date_of_service: '2021-04-05', description: 'Expert retention — Dr. Emil Voss (crane engineering)', timekeeper: null, hours: null, rate: null, amount: 5000.00, category: 'costs' },
    { id: 'li-008', invoice_id: INV_1, date_of_service: '2021-05-18', description: 'Discovery motion practice — motion to compel production', timekeeper: 'J. Park', hours: 9.0, rate: 350, amount: 3150.00, category: 'fees' },
    { id: 'li-009', invoice_id: INV_1, date_of_service: '2021-06-30', description: 'Review and respond to 47 RFPs; coordinate document production', timekeeper: 'M. Reid', hours: 12.0, rate: 450, amount: 5400.00, category: 'fees' },
    { id: 'li-010', invoice_id: INV_1, date_of_service: '2021-07-14', description: 'Mediation preparation; prepare mediation brief', timekeeper: 'M. Reid', hours: 6.0, rate: 450, amount: 2700.00, category: 'fees' },
    { id: 'li-011', invoice_id: INV_1, date_of_service: '2021-07-22', description: 'Full-day mediation session with Judge (ret.) Flores', timekeeper: 'M. Reid', hours: 10.0, rate: 450, amount: 4500.00, category: 'fees' },
    { id: 'li-012', invoice_id: INV_1, date_of_service: '2021-07-22', description: 'Mediator fee (split among defendants)', timekeeper: null, hours: null, rate: null, amount: 1500.00, category: 'costs' },
    { id: 'li-013', invoice_id: INV_1, date_of_service: '2021-09-01', description: 'Expert report review and deposition prep — Dr. Voss', timekeeper: 'M. Reid', hours: 7.0, rate: 450, amount: 3150.00, category: 'fees' },
    { id: 'li-014', invoice_id: INV_1, date_of_service: '2021-09-20', description: 'Summary judgment briefing — research and drafting', timekeeper: 'J. Park', hours: 14.0, rate: 350, amount: 4900.00, category: 'fees' },
    { id: 'li-015', invoice_id: INV_1, date_of_service: '2021-09-28', description: 'Filing fees and process service', timekeeper: null, hours: null, rate: null, amount: 525.00, category: 'costs' },
    // Invoice 2 line items
    { id: 'li-101', invoice_id: INV_2, date_of_service: '2022-01-10', description: 'Trial preparation — witness preparation sessions', timekeeper: 'M. Reid', hours: 8.5, rate: 450, amount: 3825.00, category: 'fees' },
    { id: 'li-102', invoice_id: INV_2, date_of_service: '2022-01-25', description: 'Draft and file pre-trial motions in limine', timekeeper: 'J. Park', hours: 6.0, rate: 350, amount: 2100.00, category: 'fees' },
    { id: 'li-103', invoice_id: INV_2, date_of_service: '2022-02-07', description: 'Trial — Day 1', timekeeper: 'M. Reid', hours: 12.0, rate: 450, amount: 5400.00, category: 'fees' },
    { id: 'li-104', invoice_id: INV_2, date_of_service: '2022-02-08', description: 'Trial — Day 2', timekeeper: 'M. Reid', hours: 11.0, rate: 450, amount: 4950.00, category: 'fees' },
    { id: 'li-105', invoice_id: INV_2, date_of_service: '2022-02-09', description: 'Trial — Day 3 (verdict)', timekeeper: 'M. Reid', hours: 9.0, rate: 450, amount: 4050.00, category: 'fees' },
    { id: 'li-106', invoice_id: INV_2, date_of_service: '2022-03-01', description: 'Post-trial motions and settlement negotiations', timekeeper: 'M. Reid', hours: 4.0, rate: 450, amount: 1800.00, category: 'fees' },
    { id: 'li-107', invoice_id: INV_2, date_of_service: '2022-03-15', description: 'Court costs and trial exhibits', timekeeper: null, hours: null, rate: null, amount: 275.00, category: 'costs' },
  ],
  apportionments: [
    {
      id: APP_1, invoice_id: INV_1, matter_id: MATTER_1, org_id: ORG_ID,
      calculation_method: 'pro_rata_time_on_risk',
      calculated_at: '2024-01-21T14:30:00Z',
      notes: 'Auto-calculated: pro-rata time-on-risk',
      invoices: { invoice_number: 'WB-2021-0047', total_amount: 48750.00 },
      matters: { name: 'Johnson v. Pacific Industries et al.', matter_number: '2021-CV-04471' },
      result_json: {
        invoice_total: 48750.00,
        service_start: '2021-01-01',
        service_end: '2021-12-31',
        total_exposure_days: 365,
      },
      party_apportionments: [
        {
          id: 'pa-1', percentage: 60, amount: 29250.00,
          parties: { name: 'Pacific Industries Inc.', type: 'defendant' },
          insurer_apportionments: [
            {
              id: 'ia-1', days_on_risk: 0, total_days: 365, percentage: 0, amount: 0,
              insurers: { name: 'Travelers Indemnity Co.', policy_number: 'GL-TRV-2018-88801' },
              insurer_policy_periods: { policy_start: '2018-01-01', policy_end: '2020-12-31', policy_limit: 2000000, deductible: 50000 }
            },
            {
              id: 'ia-2', days_on_risk: 365, total_days: 365, percentage: 100, amount: 29250.00,
              insurers: { name: 'Hartford Fire Insurance', policy_number: 'GL-HFI-2020-33291' },
              insurer_policy_periods: { policy_start: '2021-01-01', policy_end: '2022-12-31', policy_limit: 5000000, deductible: 100000 }
            }
          ]
        },
        {
          id: 'pa-2', percentage: 30, amount: 14625.00,
          parties: { name: 'Omega Contractors LLC', type: 'defendant' },
          insurer_apportionments: [
            {
              id: 'ia-3', days_on_risk: 365, total_days: 365, percentage: 100, amount: 14625.00,
              insurers: { name: 'Zurich American Insurance', policy_number: 'GL-ZAI-2018-55120' },
              insurer_policy_periods: { policy_start: '2018-06-01', policy_end: '2022-05-31', policy_limit: 1000000, deductible: 25000 }
            }
          ]
        },
        {
          id: 'pa-3', percentage: 10, amount: 4875.00,
          parties: { name: 'Regent Supply Co.', type: 'third_party' },
          insurer_apportionments: [
            {
              id: 'ia-4', days_on_risk: 365, total_days: 365, percentage: 100, amount: 4875.00,
              insurers: { name: 'Chubb Group Holdings', policy_number: 'GL-CHB-2019-77743' },
              insurer_policy_periods: { policy_start: '2019-03-01', policy_end: '2021-02-28', policy_limit: 500000, deductible: 10000 }
            }
          ]
        }
      ]
    }
  ],
  party_apportionments: [],
  insurer_apportionments: [],
}

// ── LocalStorage-backed store ─────────────────────────────────────────────────
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null } catch { return null }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}
function initTable(key) {
  if (!load(key)) save(key, SEED[key] || [])
  return load(key)
}

// Initialize all tables from seed on first load
const TABLES = Object.keys(SEED)
TABLES.forEach(t => { if (!load(t)) save(t, SEED[t]) })

// ── CRUD helpers ──────────────────────────────────────────────────────────────
export const db = {
  reset() { TABLES.forEach(t => save(t, SEED[t])); window.location.reload() },

  getAll(table, filters = {}) {
    const rows = load(table) || []
    return rows.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v))
  },

  getOne(table, id) {
    return (load(table) || []).find(r => r.id === id) || null
  },

  insert(table, data) {
    const rows = load(table) || []
    const row  = { id: uuid(), created_at: new Date().toISOString(), ...data }
    rows.unshift(row)
    save(table, rows)
    return row
  },

  update(table, id, data) {
    const rows = load(table) || []
    const idx  = rows.findIndex(r => r.id === id)
    if (idx === -1) return null
    rows[idx] = { ...rows[idx], ...data, updated_at: new Date().toISOString() }
    save(table, rows)
    return rows[idx]
  },

  delete(table, id) {
    const rows = (load(table) || []).filter(r => r.id !== id)
    save(table, rows)
  },

  // Joins helpers
  getMatterWithCounts(orgId) {
    const matters  = this.getAll('matters', { org_id: orgId })
    const parties  = this.getAll('parties',  { org_id: orgId })
    const invoices = this.getAll('invoices',  { org_id: orgId })
    return matters.map(m => ({
      ...m,
      parties: [{ count: parties.filter(p => p.matter_id === m.id).length }],
      invoices: [{ count: invoices.filter(i => i.matter_id === m.id).length }],
    }))
  },

  getInvoicesWithMatter(orgId) {
    const invoices = this.getAll('invoices', { org_id: orgId })
    const matters  = this.getAll('matters',  { org_id: orgId })
    return invoices.map(i => ({
      ...i,
      matters: matters.find(m => m.id === i.matter_id),
    }))
  },

  getPolicyPeriodsWithJoins(matterId) {
    const pps      = this.getAll('insurer_policy_periods', { matter_id: matterId })
    const insurers = this.getAll('insurers')
    const parties  = this.getAll('parties')
    return pps.map(pp => ({
      ...pp,
      insurers: insurers.find(i => i.id === pp.insurer_id),
      parties:  parties.find(p => p.id === pp.party_id),
    }))
  },

  getApportionmentsWithJoins(matterId) {
    const apps     = this.getAll('apportionments', { matter_id: matterId })
    const invoices = this.getAll('invoices')
    return apps.map(a => ({
      ...a,
      invoices: invoices.find(i => i.id === a.invoice_id),
    }))
  },

  getFullApportionment(id) {
    return (load('apportionments') || []).find(a => a.id === id) || null
  },
}
