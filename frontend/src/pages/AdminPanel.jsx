import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Shield, Users, Building2, Plus, X, Trash2, Mail, UserCheck, UserPlus, ArrowRightLeft, Database, Plug, CheckCircle2, AlertCircle, ExternalLink, Settings2, RefreshCcw, ChevronRight, Loader2, Key, Copy, Eye, EyeOff, Code, Terminal, Palette, Globe, Image, Wand2, User, Lock, ShieldCheck, ShieldOff, QrCode } from 'lucide-react'
import { applyPalette } from '../context/BrandingContext.jsx'
import { formatCurrency } from '../lib/calculations.js'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'

const TABS = [
  { key: 'profile',      label: 'Profile',       icon: User,      dbAdminOnly: false },
  { key: 'security',     label: 'Security',      icon: Lock,      dbAdminOnly: false },
  { key: 'users',        label: 'Users',         icon: Users,     dbAdminOnly: false },
  { key: 'orgs',         label: 'Organizations', icon: Building2, dbAdminOnly: false },
  { key: 'integrations', label: 'Integrations',  icon: Plug,      dbAdminOnly: false },
  { key: 'api',          label: 'API',            icon: Key,       dbAdminOnly: false },
  { key: 'branding',     label: 'Branding',       icon: Palette,   dbAdminOnly: false },
  { key: 'demo',         label: 'Demo Data',      icon: Wand2,     dbAdminOnly: true  },
]

// ── 2FA Enrollment Modal ──────────────────────────────────────────────────────
function TwoFAEnrollModal({ onClose, onEnrolled }) {
  const [step,       setStep]       = useState('loading')
  const [factorId,   setFactorId]   = useState(null)
  const [qrCode,     setQrCode]     = useState(null)
  const [secret,     setSecret]     = useState(null)
  const [code,       setCode]       = useState('')
  const [verifying,  setVerifying]  = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    async function startEnroll() {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) { toast.error('Could not start 2FA setup: ' + error.message); onClose(); return }
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('scan')
    }
    startEnroll()
  }, [])

  const handleConfirm = async (e) => {
    e?.preventDefault()
    if (code.length < 6 || !factorId) return
    setVerifying(true)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr) { toast.error(cErr.message); return }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
      if (vErr) { toast.error('Incorrect code — try again'); setCode(''); return }
      setStep('done')
      onEnrolled()
    } finally {
      setVerifying(false)
    }
  }

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    if (val.length === 6) setTimeout(() => handleConfirm(), 50)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-lg">Set Up Two-Factor Authentication</h2>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="p-6">
          {step === 'loading' && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          )}
          {step === 'scan' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="font-medium text-brand-900 text-sm">Scan the QR code</p>
                  <p className="text-xs text-brand-700 mt-0.5">Open your authenticator app and scan the code below.</p>
                </div>
              </div>
              {qrCode && (
                <div className="flex justify-center p-4 bg-white border-2 border-slate-200 rounded-xl">
                  <img src={qrCode} alt="2FA QR Code" className="w-44 h-44" />
                </div>
              )}
              <div>
                <button type="button" onClick={() => setShowSecret(s => !s)} className="text-xs text-brand-600 hover:text-brand-700 underline">
                  {showSecret ? 'Hide' : "Can't scan? Enter code manually"}
                </button>
                {showSecret && secret && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Manual entry key:</p>
                    <code className="text-sm font-mono font-bold text-slate-800 break-all select-all">{secret}</code>
                  </div>
                )}
              </div>
              <button onClick={() => setStep('confirm')} className="btn-primary w-full justify-center">I've scanned the code →</button>
            </div>
          )}
          {step === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="font-medium text-brand-900 text-sm">Enter the 6-digit code</p>
                  <p className="text-xs text-brand-700 mt-0.5">Enter the code shown in your authenticator app.</p>
                </div>
              </div>
              <div>
                <label className="form-label text-center block">Authentication Code</label>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  placeholder="000000" value={code} onChange={handleCodeChange} maxLength={6}
                  className="form-input text-center text-2xl font-mono tracking-[0.5em]" disabled={verifying} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('scan')} className="btn-secondary flex-1 justify-center">← Back</button>
                <button type="submit" disabled={verifying || code.length < 6} className="btn-primary flex-1 justify-center">
                  {verifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</> : 'Confirm & Enable'}
                </button>
              </div>
            </form>
          )}
          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-lg">2FA Enabled!</h3>
                <p className="text-sm text-slate-500 mt-1">Your account is now protected with two-factor authentication.</p>
              </div>
              <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const DEMO_PREFIX = '[DEMO]'

const DEMO_LAW_FIRMS = [
  'Hargrove & Kellner LLP',
  'Burke, Osei & Vantage PC',
  'Calloway Weiss LLP',
  'Meridian Trial Counsel',
  'Sterling & Cross LLP',
  'Ashford Litigation Group',
  'Navarro & Partners PC',
  'Dunmore Legal Associates',
]

const DEMO_MATTERS = [
  'Smith v. Hartford Insurance','Johnson v. Allstate Corp','Williams v. State Farm',
  'Brown v. Liberty Mutual','Jones v. Travelers Group','Garcia v. Nationwide',
  'Miller v. Progressive','Davis v. USAA','Wilson v. Farmers Insurance',
  'Anderson v. CNA Financial','Taylor v. Zurich Insurance','Thomas v. Chubb Limited',
  'Jackson v. AIG','White v. Berkshire Hathaway','Harris v. Cincinnati Financial',
  'Martin v. Markel Corp','Thompson v. Hanover Insurance','Martinez v. Erie Indemnity',
  'Robinson v. Auto-Owners','Clark v. Westfield Group',
]

const DEMO_PARTY_NAMES = [
  'Apex Manufacturing Corp.','Summit Contractors LLC','Coastal Properties Inc.',
  'Meridian Industrial Group','Pacific Distribution Co.','Atlas Construction Services',
  'Horizon Chemical Corp.','Delta Transport Solutions','Cascade Environmental Inc.',
  'Northern Supply Chain Ltd.','Granite Industrial Partners','Lakeside Logistics LLC',
  'Pinnacle Operations Group','Vector Technology Corp.','Stellar Fabrication Inc.',
  'Ironwood Properties LLC','Sunbelt Services Corp.','Keystone Maintenance Group',
  'Clearwater Industries','Anchor Building Solutions','Riverfront Holdings LLC',
  'Crestline Contractors Inc.','Monarch Industrial Partners','Blue Ridge Equipment Co.',
]

// Derive a short claim-number prefix from an insurer's name (e.g. "Travelers Insurance" → "TI")
function insurerPrefix(name) {
  return (name || '')
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3) || 'INS'
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randAmount(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100 }
function randStatus() {
  const r = Math.random()
  if (r < 0.50) return 'paid'
  if (r < 0.75) return 'pending'
  return 'demanded'
}
// Returns N percentages that sum to exactly 100, each rounded to 2dp
function randShares(n) {
  const raw  = Array.from({ length: n }, () => Math.random())
  const sum  = raw.reduce((a, b) => a + b, 0)
  const pcts = raw.map(v => Math.round(v / sum * 10000) / 100)
  // Fix rounding drift on first element
  const drift = parseFloat((100 - pcts.reduce((a, b) => a + b, 0)).toFixed(2))
  pcts[0] = parseFloat((pcts[0] + drift).toFixed(2))
  return pcts
}
// ISO date string from year + month offset
function isoDate(year, monthOffset = 0) {
  const d = new Date(year, monthOffset, 1)
  return d.toISOString().split('T')[0]
}
// ── Demo line-item pools ─────────────────────────────────────────────────────
const DEMO_TIMEKEEPERS = [
  { name: 'J. Harrison, Esq.',   rate: 625 },
  { name: 'M. Chen, Esq.',       rate: 575 },
  { name: 'R. Okafor, Esq.',     rate: 550 },
  { name: 'S. Patel, Esq.',      rate: 500 },
  { name: 'L. Torres, Esq.',     rate: 475 },
  { name: 'D. Kim, Esq.',        rate: 450 },
  { name: 'A. Williams, Esq.',   rate: 425 },
  { name: 'P. Novak, Esq.',      rate: 395 },
  { name: 'T. Reeves (Para.)',   rate: 195 },
  { name: 'C. Nguyen (Para.)',   rate: 175 },
]
const DEMO_LINE_DESCS = [
  ['Review and analyze coverage demand letter; correspondence with client re: response strategy',        'fees',    1.8],
  ['Draft reservation of rights letter; legal research re: policy exclusions',                           'fees',    2.5],
  ['Conference call with client and co-counsel re: litigation strategy and coverage position',           'fees',    1.2],
  ['Review deposition transcript of plaintiff expert witness; prepare summary memorandum',               'fees',    3.4],
  ['Research and draft motion for summary judgment on coverage issues',                                  'fees',    5.5],
  ['Review and analyze discovery requests; draft responses and objections',                              'fees',    2.8],
  ['Attend mediation session; preparation and follow-up correspondence',                                 'fees',    4.0],
  ['Review additional insured endorsements; analyze trigger of coverage issues',                         'fees',    1.6],
  ['Draft and review joint defense agreement; coordinate with co-insurers',                              'fees',    1.9],
  ['Research pollution exclusion applicability; prepare legal analysis memorandum',                      'fees',    3.2],
  ['Attend hearing on motion to compel; prepare oral argument outline',                                  'fees',    2.3],
  ['Review damage expert report; conference with client re: exposure analysis',                          'fees',    1.7],
  ['Draft demand letter response and coverage position letter',                                          'fees',    2.1],
  ['Prepare trial exhibits and witness binder; coordinate with trial team',                              'fees',    4.8],
  ['Review settlement agreement and release; advise client re: allocation terms',                        'fees',    1.5],
  ['Telephone conference with opposing counsel re: discovery disputes',                                  'fees',    0.6],
  ['Review and respond to coverage interrogatories',                                                     'fees',    2.4],
  ['Legal research re: late notice defense; prepare analysis for client',                                'fees',    2.9],
  ['Document review and privilege log preparation',                                                      'fees',    3.8],
  ['Draft motion to bifurcate coverage and bad faith claims',                                            'fees',    3.0],
  ['Court filing fees',                                                                                  'costs',   null],
  ['Deposition transcript — Dr. Patricia Moore (expert)',                                                'costs',   null],
  ['Westlaw legal research charges',                                                                     'costs',   null],
  ['Process server fees — service on third-party defendants',                                            'costs',   null],
  ['Travel expenses — client meeting and site inspection',                                               'costs',   null],
  ['Expert consultant fees — engineering analysis',                                                      'costs',   null],
  ['Copying and document production charges',                                                            'costs',   null],
  ['Court reporter fees — deposition of C. Henriksen',                                                  'costs',   null],
]

// Build 4–10 realistic line items for one invoice, returning rows and total
function buildDemoLineItems(invoiceId, baseYear) {
  const count       = rand(4, 10)
  const picked      = pickN(DEMO_LINE_DESCS, count)
  const invoiceYear = baseYear + rand(1, 3)
  const rows = []
  let total = 0
  picked.forEach(([desc, category, stdHours]) => {
    const tk    = DEMO_TIMEKEEPERS[rand(0, DEMO_TIMEKEEPERS.length - 1)]
    const month = rand(0, 11)
    const day   = rand(1, 28)
    const dos   = `${invoiceYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    let hours = null, rate = null, amount = 0
    if (category === 'fees') {
      hours  = parseFloat(((stdHours || 1) + (Math.random() - 0.3)).toFixed(1))
      if (hours < 0.3) hours = 0.3
      rate   = tk.rate
      amount = parseFloat((hours * rate).toFixed(2))
    } else {
      amount = randAmount(250, 3500)
    }
    total += amount
    rows.push({
      invoice_id:      invoiceId,
      date_of_service: dos,
      description:     desc,
      timekeeper:      category === 'fees' ? tk.name : null,
      hours,
      rate,
      amount,
      category,
    })
  })
  return { rows, total: parseFloat(total.toFixed(2)) }
}

// Pick n unique items at random from array (no repeat)
function pickN(arr, n) {
  const copy = [...arr]
  const out  = []
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = rand(0, copy.length - 1)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

// ── QBO / Clio OAuth URLs (client_id goes in frontend — it's not a secret) ───
const QBO_CLIENT_ID    = import.meta.env.VITE_QBO_CLIENT_ID    ?? ''
const QBO_REDIRECT_URI = import.meta.env.VITE_QBO_REDIRECT_URI ?? ''
const CLIO_CLIENT_ID    = import.meta.env.VITE_CLIO_CLIENT_ID    ?? ''
const CLIO_REDIRECT_URI = import.meta.env.VITE_CLIO_REDIRECT_URI ?? ''

function buildOAuthURL(provider, orgId) {
  const state = btoa(JSON.stringify({ provider, org_id: orgId }))
  if (provider === 'quickbooks') {
    const params = new URLSearchParams({
      client_id:     QBO_CLIENT_ID,
      redirect_uri:  QBO_REDIRECT_URI,
      response_type: 'code',
      scope:         'com.intuit.quickbooks.accounting',
      state,
    })
    return `https://appcenter.intuit.com/connect/oauth2?${params}`
  }
  if (provider === 'clio') {
    const params = new URLSearchParams({
      client_id:     CLIO_CLIENT_ID,
      redirect_uri:  CLIO_REDIRECT_URI,
      response_type: 'code',
      state,
    })
    return `https://app.clio.com/oauth/authorize?${params}`
  }
  return ''
}

// ── Integration settings form (post-connect) ─────────────────────────────────
function IntegrationSettingsForm({ conn, onSaved }) {
  const qc = useQueryClient()
  const isQBO  = conn.provider === 'quickbooks'
  const isClio = conn.provider === 'clio'
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: conn.settings ?? {},
  })

  const onSubmit = async (values) => {
    const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''))
    const { error } = await supabase
      .from('la_accounting_connections')
      .update({ settings })
      .eq('id', conn.id)
    if (error) { toast.error(error.message); return }
    toast.success('Settings saved')
    qc.invalidateQueries({ queryKey: ['accounting-connections'] })
    onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Settings</p>
      {isQBO && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Deposit Account ID</label>
              <input className="form-input text-sm" placeholder="35"
                {...register('deposit_account_id')} />
              <p className="text-xs text-slate-400 mt-1">QBO Chart of Accounts ID for your bank</p>
            </div>
            <div>
              <label className="form-label">Income Account ID</label>
              <input className="form-input text-sm" placeholder="79"
                {...register('income_account_id')} />
              <p className="text-xs text-slate-400 mt-1">QBO COA ID for income/revenue account</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Find account IDs in QBO: Accounting → Chart of Accounts → hover the account → Account ID shows in URL.
          </p>
        </>
      )}
      {isClio && (
        <div>
          <label className="form-label">Default Clio Matter ID (optional)</label>
          <input className="form-input text-sm" placeholder="123456"
            {...register('clio_matter_id')} />
          <p className="text-xs text-slate-400 mt-1">
            Payments will be logged under this matter. Find it in Clio → Matter → URL contains the ID.
          </p>
        </div>
      )}
      <button type="submit" className="btn-primary text-sm" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save Settings'}
      </button>
    </form>
  )
}

"LEXALLOC_BUILD_MARKER_XYZ789"
// ─── Invite User Modal ────────────────────────────────────────────────────────

function InviteUserModal({ onClose, orgs, defaultOrgId, insurers = [] }) {
  const qc = useQueryClient()
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  // Local state drives conditional rendering — no react-hook-form watch needed
  const [selectedRole,  setSelectedRole]  = useState('user')
  const [selectedOrgId, setSelectedOrgId] = useState(defaultOrgId || orgs[0]?.id || '')
  const [selectedInsurer, setSelectedInsurer] = useState('')
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { role: 'user', org_id: defaultOrgId || orgs[0]?.id || '', insurer_id: '' }
  })

  const orgInsurers = insurers.filter(i => i.org_id === selectedOrgId)

  const onSubmit = async (values) => {
    try {
      // Edge function pre-creates the profile and returns user_id synchronously
      const result = await api.inviteUser(values.email, values.role, values.org_id)
      // Assign insurer immediately using the returned user_id — no delay needed
      if (values.role === 'client' && selectedInsurer && result?.user_id) {
        await supabase.from('la_profiles')
          .update({ insurer_id: selectedInsurer })
          .eq('id', result.user_id)
      }
      setSentEmail(values.email)
      setSent(true)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) {
      toast.error(err.message || 'Failed to send invite')
    }
  }

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCheck className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Invite Sent!</h2>
            <p className="text-slate-500 text-sm mb-6">
              An invitation has been sent to <strong>{sentEmail}</strong>. They'll receive a link to set their password and join the organization.
            </p>
            <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Invite User</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Organization *</label>
            <select
              className="form-input"
              value={selectedOrgId}
              {...register('org_id', { required: true })}
              onChange={e => {
                setSelectedOrgId(e.target.value)
                setSelectedInsurer('')
                setValue('org_id', e.target.value)
              }}
            >
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Email Address *</label>
            <input type="email" className="form-input" placeholder="attorney@firm.com"
              {...register('email', { required: 'Required' })} />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="form-label">Role</label>
            <select
              className="form-input"
              value={selectedRole}
              {...register('role')}
              onChange={e => {
                setSelectedRole(e.target.value)
                setSelectedInsurer('')
                setValue('role', e.target.value)
              }}
            >
              <option value="user">User — standard access</option>
              <option value="client">Client — view only</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
          {selectedRole === 'client' && (
            <div>
              <label className="form-label">Insurer <span className="text-slate-400 font-normal">(optional)</span></label>
              <select
                className="form-input"
                value={selectedInsurer}
                onChange={e => setSelectedInsurer(e.target.value)}
              >
                <option value="">— assign later —</option>
                {orgInsurers.map(ins => (
                  <option key={ins.id} value={ins.id}>{ins.name}</option>
                ))}
              </select>
              {orgInsurers.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No insurers found for this org yet.</p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              <Mail className="h-4 w-4" /> {isSubmitting ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add Organization Modal ───────────────────────────────────────────────────

function AddOrgModal({ onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async ({ orgName }) => {
    const { error } = await supabase
      .from('la_organizations')
      .insert({ name: orgName.trim() })
    if (error) { toast.error(error.message); return }
    toast.success(`"${orgName.trim()}" created`)
    qc.invalidateQueries({ queryKey: ['admin-orgs'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Add Organization</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Organization / Firm Name *</label>
            <input className="form-input" placeholder="Smith & Associates LLP"
              {...register('orgName', { required: 'Name is required', minLength: { value: 2, message: 'Must be at least 2 characters' } })} />
            {errors.orgName && <p className="text-red-500 text-xs mt-1">{errors.orgName.message}</p>}
          </div>
          <p className="text-xs text-slate-400">
            Use "Assign User" on this org after creation to move existing users in, or invite new ones directly.
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              <Building2 className="h-4 w-4" /> {isSubmitting ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Assign User to Org Modal ─────────────────────────────────────────────────

function AssignUserModal({ org, allUsers, onClose, onAssigned }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm()
  const eligible = allUsers.filter(u => u.org_id !== org.id)

  const onSubmit = async ({ userId }) => {
    if (!userId) { toast.error('Select a user first'); return }
    const user = allUsers.find(u => u.id === userId)
    const { error } = await supabase
      .from('la_profiles')
      .update({ org_id: org.id, insurer_id: null })
      .eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success(`${user?.first_name || user?.email || 'User'} moved to ${org.name}`)
    onAssigned()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg">Assign User to Org</h2>
            <p className="text-sm text-slate-500 mt-0.5">{org.name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {eligible.length === 0 ? (
            <>
              <p className="text-sm text-slate-500 text-center py-4">All users are already in this organization.</p>
              <button onClick={onClose} className="btn-secondary w-full justify-center">Close</button>
            </>
          ) : (
            <>
              <div>
                <label className="form-label">Select User *</label>
                <select className="form-input" {...register('userId', { required: true })}>
                  <option value="">— choose a user —</option>
                  {eligible.map(u => (
                    <option key={u.id} value={u.id}>
                      {(u.first_name || u.last_name)
                        ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                        : u.email}
                      {' '}({u.la_organizations?.name || 'no org'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
                <ArrowRightLeft className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>Moving a user changes their organization and clears any insurer assignment, since insurers are org-specific.</span>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
                  <UserPlus className="h-4 w-4" /> {isSubmitting ? 'Moving…' : 'Move to This Org'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

// ── FileVine connection card (API key auth, no OAuth) ─────────────────────────
function FileVineConnectionCard({ orgId }) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)

  const { data: conn } = useQuery({
    queryKey: ['filevine-conn', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_pm_connections')
        .select('*')
        .eq('org_id', orgId)
        .eq('provider', 'filevine')
        .eq('is_active', true)
        .single()
      return data ?? null
    },
    enabled: !!orgId,
  })

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: conn?.credentials ?? {},
  })

  const onSubmit = async (values) => {
    const credentials = {
      api_key:    values.api_key,
      fv_org_id:  values.fv_org_id,
      fv_user_id: values.fv_user_id,
    }
    const { error } = await supabase
      .from('la_pm_connections')
      .upsert({
        org_id:      orgId,
        provider:    'filevine',
        credentials,
        is_active:   true,
        connected_at: new Date().toISOString(),
        connected_by: profile?.id,
      }, { onConflict: 'org_id,provider' })
    if (error) { toast.error(error.message); return }
    toast.success('FileVine connected!')
    setShowForm(false)
    qc.invalidateQueries({ queryKey: ['filevine-conn', orgId] })
    qc.invalidateQueries({ queryKey: ['pms-providers'] })
  }

  const disconnect = async () => {
    if (!confirm('Disconnect FileVine? Matter import will stop working.')) return
    await supabase.from('la_pm_connections').update({ is_active: false }).eq('org_id', orgId).eq('provider', 'filevine')
    toast.success('FileVine disconnected')
    qc.invalidateQueries({ queryKey: ['filevine-conn', orgId] })
    qc.invalidateQueries({ queryKey: ['pms-providers'] })
  }

  return (
    <div className={`card p-5 border ${conn ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
            <Plug className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">FileVine</p>
              {conn ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Not connected</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Import matters (cases) directly from FileVine into LexAlloc.
            </p>
            {conn && (
              <p className="text-xs text-slate-400 mt-1">
                Connected {format(parseISO(conn.connected_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a href="https://support.filevine.com/hc/en-us/articles/360047817153" target="_blank" rel="noopener noreferrer"
            className="btn-secondary text-xs py-1.5 px-3">
            <ExternalLink className="h-3.5 w-3.5" /> Docs
          </a>
          {conn ? (
            <>
              <button onClick={() => setShowForm(!showForm)} className="btn-secondary text-xs py-1.5 px-3">
                <Settings2 className="h-3.5 w-3.5" /> Edit
              </button>
              <button onClick={disconnect} className="btn-secondary text-xs py-1.5 px-3 text-red-600 border-red-200 hover:bg-red-50">
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs py-1.5 px-3">
              <Plug className="h-3.5 w-3.5" /> Connect
            </button>
          )}
        </div>
      </div>

      {/* Credentials form */}
      {(showForm || (!conn)) && showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">API Credentials</p>
          <div>
            <label className="form-label">API Key *</label>
            <input className="form-input text-sm font-mono" placeholder="fv_live_…"
              {...register('api_key', { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">FileVine Org ID *</label>
              <input className="form-input text-sm" placeholder="12345"
                {...register('fv_org_id', { required: true })} />
            </div>
            <div>
              <label className="form-label">FileVine User ID *</label>
              <input className="form-input text-sm" placeholder="67890"
                {...register('fv_user_id', { required: true })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : conn ? 'Update' : 'Connect FileVine'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Org Detail Drawer ────────────────────────────────────────────────────────

function OrgDetailDrawer({ org, orgUsers, currentUserId, isPlatformAdmin, roleColors, onClose, onInvite, onRoleChange, onInvalidate }) {
  const [search, setSearch] = useState('')

  const { data: orgStats } = useQuery({
    queryKey: ['org-detail-stats', org.id],
    queryFn: async () => {
      const [mattersRes, invoicesRes] = await Promise.all([
        supabase.from('la_matters').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        supabase.from('la_invoices').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      ])
      return {
        matters:  mattersRes.count  ?? 0,
        invoices: invoicesRes.count ?? 0,
      }
    },
  })

  const filtered = orgUsers.filter(u => {
    const q = search.toLowerCase()
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase()
    return !q || name.includes(q) || (u.email || '').toLowerCase().includes(q)
  })

  const initials = (u) => {
    const f = (u.first_name || '')[0] || ''
    const l = (u.last_name  || '')[0] || ''
    return (f + l).toUpperCase() || (u.email || '?')[0].toUpperCase()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-slate-900">{org.name}</h2>
            </div>
            <p className="text-sm text-slate-400">
              Created {org.created_at ? format(parseISO(org.created_at), 'MMMM d, yyyy') : '—'}
              {org.slug && <span className="ml-2 font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{org.slug}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 p-6 border-b border-slate-100">
          {[
            { label: 'Users',    value: orgUsers.length,         color: 'text-brand-600',  bg: 'bg-brand-50'  },
            { label: 'Matters',  value: orgStats?.matters  ?? '—', color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Invoices', value: orgStats?.invoices ?? '—', color: 'text-emerald-600',bg: 'bg-emerald-50'},
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-4 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Users section */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3">
          <h3 className="font-semibold text-slate-800 text-sm">Users</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="form-input text-xs py-1.5 px-3 h-auto w-44"
            />
            <button
              onClick={onInvite}
              className="btn-primary text-xs py-1.5 px-3"
            >
              <UserPlus className="h-3.5 w-3.5" /> Invite User
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">
              {orgUsers.length === 0 ? 'No users in this organization yet.' : 'No users match your search.'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2">User</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2">Role</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2">Joined</th>
                  {isPlatformAdmin && (
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2">DB Admin</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(u => {
                  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unknown'
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {initials(u)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
                              {name}
                              {u.id === currentUserId && <span className="text-xs text-brand-600 font-normal">(you)</span>}
                            </p>
                            <p className="text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {isPlatformAdmin ? (
                          <select
                            value={u.role}
                            onChange={e => { onRoleChange(u.id, e.target.value); onInvalidate() }}
                            disabled={u.id === currentUserId}
                            className={`badge border-0 cursor-pointer ${roleColors[u.role] || 'bg-slate-100 text-slate-600'} disabled:opacity-50`}
                          >
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                            <option value="client">Client</option>
                          </select>
                        ) : (
                          <span className={`badge ${roleColors[u.role] || 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-400">
                        {u.created_at ? format(parseISO(u.created_at), 'MM/dd/yyyy') : '—'}
                      </td>
                      {isPlatformAdmin && (
                        <td className="py-3">
                          {u.is_platform_admin
                            ? <span className="badge bg-purple-100 text-purple-700 text-xs">DB Admin</span>
                            : <span className="text-xs text-slate-300">—</span>
                          }
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { profile, refetchProfile, hasTOTP, refreshMfaLevel } = useAuth()
  const isAdmin = profile?.role === 'admin'

  // ── Profile & Security state ───────────────────────────────────────────────
  const [showEnroll,   setShowEnroll]   = useState(false)
  const [disabling2FA, setDisabling2FA] = useState(false)

  const { register: regProfile, handleSubmit: handleProfileSubmit, reset: resetProfile, formState: { isSubmitting: isProfileSubmitting } } = useForm()
  const { register: regPwd,     handleSubmit: handlePwd,           reset: resetPwd,     formState: { isSubmitting: isPwdSubmitting }     } = useForm()

  useEffect(() => {
    if (profile) {
      resetProfile({ first_name: profile.first_name, last_name: profile.last_name, email: profile.email, role: profile.role })
    }
  }, [profile])

  const onSaveProfile = async (values) => {
    const updates = { first_name: values.first_name, last_name: values.last_name }
    if (isAdmin) updates.role = values.role
    const { error } = await supabase.from('la_profiles').update(updates).eq('id', profile.id)
    if (error) { toast.error(error.message); return }
    if (isAdmin && values.email !== profile.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: values.email })
      if (emailErr) toast.error('Profile saved but email update failed: ' + emailErr.message)
      else toast.success('Profile updated! Check your new email for a confirmation link.')
      refetchProfile(); return
    }
    toast.success('Profile updated!')
    refetchProfile()
  }

  const onChangePassword = async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { toast.error(error.message); return }
    toast.success('Password updated!')
    resetPwd()
  }

  const handleDisable2FA = async () => {
    if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return
    setDisabling2FA(true)
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr || !factors?.totp?.length) { toast.error('No 2FA factor found.'); return }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factors.totp[0].id })
      if (error) { toast.error('Failed to disable 2FA: ' + error.message); return }
      await refreshMfaLevel()
      toast.success('Two-factor authentication disabled.')
    } finally {
      setDisabling2FA(false)
    }
  }

  const handleEnrolled = async () => {
    await refreshMfaLevel()
    setShowEnroll(false)
    toast.success('Two-factor authentication is now active.')
  }

  const [tab, setTab]             = useState('profile')
  const [userRoleTab, setUserRoleTab] = useState('user')

  // Handle OAuth redirect back (?connected=quickbooks / ?error=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const billing   = params.get('billing')
    const tabParam  = params.get('tab')
    const error     = params.get('error')
    if (connected) {
      setTab('integrations')
      toast.success(`${connected === 'quickbooks' ? 'QuickBooks' : 'Clio'} connected!`)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (billing === 'success') {
      setTab('billing')
      toast.success('Subscription activated — welcome to Professional! 🎉')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (billing === 'canceled') {
      setTab('billing')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (tabParam) {
      setTab(tabParam)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      setTab('integrations')
      toast.error(`Connection failed: ${error}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])
  const [showInvite,     setShowInvite]     = useState(false)
  const [showAddOrg,     setShowAddOrg]     = useState(false)
  const [assignModal,    setAssignModal]    = useState(null)
  const [selectedOrg,    setSelectedOrg]    = useState(null)
  // Optimistic insurer display — keyed by userId, cleared after refetch
  const [pendingInsurers, setPendingInsurers] = useState({})

  // ── Demo Data ─────────────────────────────────────────────────────────────
  const [demoGenerating, setDemoGenerating] = useState(false)
  const [demoClearing,   setDemoClearing]   = useState(false)
  const [demoProgress,   setDemoProgress]   = useState('')
  const [demoStats,      setDemoStats]      = useState(null)

  const qc = useQueryClient()
  const isPlatformAdmin = profile?.is_platform_admin === true

  // Platform admins see everyone; org admins see their org only
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id],
    enabled: !!profile,
    queryFn: async () => {
      let q = supabase
        .from('la_profiles')
        .select('*, la_organizations(name), la_insurers(name)')
        .order('created_at', { ascending: false })
      if (!isPlatformAdmin) q = q.eq('org_id', profile.org_id)
      const { data } = await q
      return data || []
    }
  })

  const { data: insurers = [] } = useQuery({
    queryKey: ['admin-insurers'],
    queryFn: async () => {
      const { data } = await supabase.from('la_insurers').select('id, name, org_id').order('name')
      return data || []
    }
  })

  const { data: accountingConnections = [] } = useQuery({
    queryKey: ['accounting-connections'],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_accounting_connections')
        .select('*')
        .eq('org_id', profile?.org_id)
      return data || []
    },
    enabled: !!profile?.org_id,
  })

  // ── API Keys ──────────────────────────────────────────────────────────────
  const [showCreateKey,    setShowCreateKey]    = useState(false)
  const [newKeyResult,     setNewKeyResult]     = useState(null)  // { key, name }
  const [newKeyName,       setNewKeyName]       = useState('')
  const [newKeyScopes,     setNewKeyScopes]     = useState(['read'])
  const [newKeyExpiry,     setNewKeyExpiry]     = useState('')
  const [creatingKey,      setCreatingKey]      = useState(false)
  const [copiedKey,        setCopiedKey]        = useState(false)
  const [revealedKeys,     setRevealedKeys]     = useState(new Set())

  const toggleKeyReveal = (id) =>
    setRevealedKeys(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const { data: apiKeys = [], refetch: refetchKeys } = useQuery({
    queryKey: ['api-keys', profile?.org_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_api_keys')
        .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_by_email, created_at')
        .eq('org_id', profile?.org_id)
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!profile?.org_id && tab === 'api',
  })

  const generateApiKey = async () => {
    if (!newKeyName.trim()) { toast.error('Enter a name for this key'); return }
    setCreatingKey(true)
    try {
      // Generate a cryptographically random key in the browser
      const array  = new Uint8Array(32)
      crypto.getRandomValues(array)
      const rawKey = 'lx_live_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')

      // Hash it using SubtleCrypto
      const encoder   = new TextEncoder()
      const keyBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey))
      const hashHex   = Array.from(new Uint8Array(keyBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      const { error } = await supabase.from('la_api_keys').insert({
        org_id:          profile.org_id,
        name:            newKeyName.trim(),
        key_hash:        hashHex,
        key_prefix:      rawKey.slice(0, 16),
        scopes:          newKeyScopes,
        expires_at:      newKeyExpiry || null,
        created_by_email: profile.email,
      })
      if (error) throw error

      setNewKeyResult({ key: rawKey, name: newKeyName.trim() })
      setNewKeyName('')
      setNewKeyScopes(['read'])
      setNewKeyExpiry('')
      setShowCreateKey(false)
      refetchKeys()
    } catch (err) {
      toast.error(err.message || 'Failed to create API key')
    } finally {
      setCreatingKey(false)
    }
  }

  const revokeApiKey = async (keyId, keyName) => {
    if (!confirm(`Revoke "${keyName}"? Any integrations using this key will stop working immediately.`)) return
    const { error } = await supabase.from('la_api_keys').update({ is_active: false }).eq('id', keyId)
    if (error) { toast.error(error.message); return }
    toast.success(`"${keyName}" revoked`)
    refetchKeys()
  }

  const copyToClipboard = async (text) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  // ── Demo Data generator ───────────────────────────────────────────────────
  const generateDemoData = async () => {
    setDemoGenerating(true)
    setDemoProgress('Creating demo matters…')
    try {
      const orgId = profile.org_id

      // ── 1a. Law firms ────────────────────────────────────────────────────
      setDemoProgress('Creating demo law firms…')
      const firmRows = DEMO_LAW_FIRMS.map(name => ({
        org_id: orgId,
        name:   `${DEMO_PREFIX} ${name}`,
      }))
      const { data: firms, error: firmErr } = await supabase
        .from('la_firms').insert(firmRows).select('id')
      if (firmErr) throw firmErr

      // ── 1b. Matters (assigned round-robin across firms) ──────────────────
      setDemoProgress('Creating demo matters…')
      const matterRows = DEMO_MATTERS.map((name, i) => ({
        org_id:  orgId,
        name:    `${DEMO_PREFIX} ${name}`,
        status:  'active',
        firm_id: firms[i % firms.length].id,
      }))
      const { data: matters, error: mErr } = await supabase
        .from('la_matters').insert(matterRows).select('id')
      if (mErr) throw mErr

      // ── 2. Parties (2–4 per matter, with responsible date ranges) ───────
      setDemoProgress('Creating parties…')
      const partyRows = []
      // Track per-matter config for later use (parties list, date range)
      const matterMeta = matters.map(m => {
        const baseYear   = rand(2010, 2018)
        const partyCount = rand(2, 4)
        const shares     = randShares(partyCount)
        const partyNames = pickN(DEMO_PARTY_NAMES, partyCount)
        const parties    = partyNames.map((name, i) => {
          // Stagger start dates slightly; end dates vary so some overlap, some sequential
          const startYear = baseYear + rand(0, 1)
          const startMon  = rand(0, 11)
          const endYear   = startYear + rand(2, 7)
          const endMon    = rand(0, 11)
          return {
            matter_id:          m.id,
            org_id:             orgId,
            name:               `${DEMO_PREFIX} ${name}`,
            share_percentage:   shares[i],
            responsible_start:  isoDate(startYear, startMon),
            responsible_end:    isoDate(endYear,   endMon),
            _baseYear: baseYear,  // temp field — stripped before insert
          }
        })
        return { matterId: m.id, baseYear, parties }
      })
      // Build flat rows, strip temp fields
      matterMeta.forEach(mm => mm.parties.forEach(p => {
        const { _baseYear, ...row } = p
        partyRows.push(row)
      }))
      const { data: parties, error: pErr } = await supabase
        .from('la_parties').insert(partyRows).select('id, matter_id, responsible_start, responsible_end')
      if (pErr) throw pErr

      // ── 3. Load real org insurers (no demo copies created) ─────────────
      setDemoProgress('Loading your insurers…')
      const { data: insurers, error: insErr } = await supabase
        .from('la_insurers')
        .select('id, name')
        .eq('org_id', orgId)
        .not('name', 'ilike', `${DEMO_PREFIX}%`)
        .order('name')
      if (insErr) throw insErr
      if (!insurers?.length) throw new Error('No insurers found in your Rolodex. Add insurers under Settings → Rolodex → Insurers first, then generate demo data.')

      // ── 4. Insurer policy periods (2–3 insurers per party) ──────────────
      setDemoProgress('Assigning insurer policy periods…')
      const policyRows = []
      let ppIdx = 0

      for (const party of parties) {
        // Pick 2–3 insurers randomly for this party
        const ins2use  = pickN(insurers, rand(2, 3))
        const pStart   = new Date(party.responsible_start)
        const pEnd     = new Date(party.responsible_end)
        const spanYrs  = Math.max(1, Math.round((pEnd - pStart) / (365.25 * 86400000)))

        // Divide responsible period into overlapping policy windows
        ins2use.forEach((ins, i) => {
          const prefix = insurerPrefix(ins.name)
          // Policy windows: first covers early period, last covers later, middle overlaps both
          const winStart = new Date(pStart)
          winStart.setFullYear(winStart.getFullYear() + Math.max(0, i * Math.floor(spanYrs / ins2use.length) - 1))
          const winEnd = new Date(winStart)
          winEnd.setFullYear(winEnd.getFullYear() + rand(2, 4))

          const seqNum = String(1000 + ppIdx++).slice(1) // 4-digit zero-padded
          policyRows.push({
            insurer_id:    ins.id,
            party_id:      party.id,
            matter_id:     party.matter_id,
            org_id:        orgId,
            policy_start:  winStart.toISOString().split('T')[0],
            policy_end:    winEnd.toISOString().split('T')[0],
            policy_limit:  randAmount(500000, 5000000),
            claim_number:  `${prefix}-${new Date().getFullYear()}-${seqNum}`,
          })
        })
      }
      const { error: ppErr } = await supabase
        .from('la_insurer_policy_periods').insert(policyRows)
      if (ppErr) throw ppErr

      // ── 5. Invoices + line items ─────────────────────────────────────────
      setDemoProgress('Creating invoices and line items…')
      // Each matter gets 1–3 invoices; invoices have 4–10 real line items each.
      // Service dates are set inside the party responsible range so the advisor
      // and apportionment logic can find overlapping parties.
      const DEMO_FIRMS = ['Smith & Kellner LLP','Hargrove Litigation Group','Burke & Osei PC',
        'Vantage Legal Partners','Calloway Weiss LLP','Meridian Trial Counsel']
      const invoiceRows = []
      matters.forEach(m => {
        const meta         = matterMeta.find(mm => mm.matterId === m.id)
        const baseYear     = meta?.baseYear || 2015
        const invoiceCount = rand(1, 3)
        // Pick a service window anchored inside the baseYear+1 to baseYear+3 span
        // so it reliably overlaps the party responsible ranges
        for (let iv = 0; iv < invoiceCount; iv++) {
          const svcYear  = baseYear + rand(1, 3)
          const svcMonth = rand(0, 10)        // 0–10 so end month doesn't overflow
          const svcStart = `${svcYear}-${String(svcMonth + 1).padStart(2, '0')}-01`
          const svcEnd   = `${svcYear}-${String(svcMonth + 2).padStart(2, '0')}-28`
          const invYear  = svcYear
          const invMonth = svcMonth + 1
          invoiceRows.push({
            matter_id:      m.id,
            org_id:         orgId,
            total_amount:   0,
            service_start:  svcStart,
            service_end:    svcEnd,
            invoice_date:   svcEnd,
            invoice_number: `INV-${invYear}-${String(rand(1000, 9999))}`,
            billing_firm:   DEMO_FIRMS[rand(0, DEMO_FIRMS.length - 1)],
            status:         'parsed',
            _baseYear:      baseYear,
          })
        }
      })
      // Insert invoices (strip temp _baseYear field)
      const { data: invoices, error: iErr } = await supabase
        .from('la_invoices')
        .insert(invoiceRows.map(({ _baseYear, ...r }) => r))
        .select('id, matter_id')
      if (iErr) throw iErr

      // Build line items for each invoice; collect totals to back-fill
      const allLineItemRows = []
      const invoiceTotals   = {}
      invoices.forEach((inv, idx) => {
        const baseYear = invoiceRows[idx]?._baseYear || 2015
        const { rows, total } = buildDemoLineItems(inv.id, baseYear)
        allLineItemRows.push(...rows)
        invoiceTotals[inv.id] = total
      })
      // Insert line items in batches of 100
      for (let i = 0; i < allLineItemRows.length; i += 100) {
        const { error: liErr } = await supabase
          .from('la_invoice_line_items').insert(allLineItemRows.slice(i, i + 100))
        if (liErr) throw liErr
      }
      // Back-fill total_amount on each invoice
      await Promise.all(
        invoices.map(inv =>
          supabase.from('la_invoices').update({ total_amount: invoiceTotals[inv.id] }).eq('id', inv.id)
        )
      )

      // ── 6. Apportionments ───────────────────────────────────────────────
      setDemoProgress('Creating apportionments…')
      const appRows = invoices.map(inv => ({
        invoice_id:         inv.id,
        matter_id:          inv.matter_id,
        org_id:             orgId,
        calculation_method: ['equal_shares','weighted_billing','time_on_risk'][rand(0,2)],
      }))
      const { data: apportionments, error: aErr } = await supabase
        .from('la_apportionments').insert(appRows).select('id')
      if (aErr) throw aErr

      // ── 7. Insurer apportionments (financial KPI data) ───────────────────
      setDemoProgress('Creating insurer obligation records…')
      const insurerAppRows = []
      for (const app of apportionments) {
        // Build a realistic set: 2–5 obligations per apportionment
        const count = rand(2, 5)
        const shares = randShares(count)
        const totalAmt = randAmount(20000, 300000)
        shares.forEach((pct, i) => {
          const status = randStatus()
          const amount = parseFloat((totalAmt * pct / 100).toFixed(2))
          insurerAppRows.push({
            apportionment_id: app.id,
            insurer_id:       insurers[rand(0, insurers.length - 1)].id,
            percentage:       pct,
            amount,
            amount_paid:  status === 'paid'    ? amount
                        : status === 'pending' ? 0
                        : randAmount(0, amount / 2),
            payment_status: status,
          })
        })
      }
      for (let i = 0; i < insurerAppRows.length; i += 100) {
        const { error: iaErr } = await supabase
          .from('la_insurer_apportionments')
          .insert(insurerAppRows.slice(i, i + 100))
        if (iaErr) throw iaErr
      }

      const paid     = insurerAppRows.filter(r => r.payment_status === 'paid').length
      const pending  = insurerAppRows.filter(r => r.payment_status === 'pending').length
      const demanded = insurerAppRows.filter(r => r.payment_status === 'demanded').length
      setDemoStats({
        matters:        matters.length,
        invoices:       invoices.length,
        lineItems:      allLineItemRows.length,
        parties:        parties.length,
        policyPeriods:  policyRows.length,
        apportionments: apportionments.length,
        total:          insurerAppRows.length,
        paid, pending, demanded,
      })
      setDemoProgress('')
      toast.success('Demo data generated!')
      qc.invalidateQueries()
    } catch (err) {
      setDemoProgress('')
      toast.error(err.message || 'Demo generation failed')
    } finally {
      setDemoGenerating(false)
    }
  }

  const clearDemoData = async () => {
    if (!confirm('Delete all [DEMO] matters, parties, insurers, and related data? This cannot be undone.')) return
    setDemoClearing(true)
    setDemoProgress('Finding demo matters…')
    try {
      const { data: demoMatters } = await supabase
        .from('la_matters')
        .select('id')
        .ilike('name', `${DEMO_PREFIX}%`)
        .eq('org_id', profile.org_id)
      if (!demoMatters?.length) { toast.success('No demo data found.'); return }

      const mIds = demoMatters.map(m => m.id)

      // ── Cascade: insurer_apportionments → apportionments ────────────────
      setDemoProgress('Removing apportionments…')
      const { data: apps } = await supabase
        .from('la_apportionments').select('id').in('matter_id', mIds)
      if (apps?.length) {
        const aIds = apps.map(a => a.id)
        await supabase.from('la_insurer_apportionments').delete().in('apportionment_id', aIds)
        await supabase.from('la_apportionments').delete().in('id', aIds)
      }

      // ── Cascade: policy_periods → parties ───────────────────────────────
      setDemoProgress('Removing parties and policy periods…')
      await supabase.from('la_insurer_policy_periods').delete().in('matter_id', mIds)
      await supabase.from('la_parties').delete().in('matter_id', mIds)

      // ── Invoices, line items & matters ──────────────────────────────────
      const { data: demoInvs } = await supabase.from('la_invoices').select('id').in('matter_id', mIds)
      if (demoInvs?.length) {
        const invIds = demoInvs.map(i => i.id)
        await supabase.from('la_invoice_line_items').delete().in('invoice_id', invIds)
      }
      await supabase.from('la_invoices').delete().in('matter_id', mIds)
      await supabase.from('la_matters').delete().in('id', mIds)

      // ── Demo law firms ───────────────────────────────────────────────────
      await supabase.from('la_firms')
        .delete()
        .ilike('name', `${DEMO_PREFIX}%`)
        .eq('org_id', profile.org_id)

      setDemoStats(null)
      setDemoProgress('')
      toast.success('Demo data cleared.')
      qc.invalidateQueries()
    } catch (err) {
      setDemoProgress('')
      toast.error(err.message || 'Failed to clear demo data')
    } finally {
      setDemoClearing(false)
    }
  }

  // ── Branding ──────────────────────────────────────────────────────────────
  const [brandForm, setBrandForm] = useState({
    brand_name:          '',
    brand_logo_url:      '',
    brand_favicon_url:   '',
    brand_primary_color: '',
    brand_support_email: '',
    custom_domain:       '',
  })
  const [savingBrand, setSavingBrand] = useState(false)
  const [colorPreviewErr, setColorPreviewErr] = useState(false)

  useQuery({
    queryKey: ['org-branding', profile?.org_id],
    enabled:  !!profile?.org_id && tab === 'branding',
    queryFn:  async () => {
      const { data } = await supabase
        .from('la_organizations')
        .select('brand_name,brand_logo_url,brand_favicon_url,brand_primary_color,brand_support_email,custom_domain')
        .eq('id', profile.org_id)
        .single()
      if (data) {
        setBrandForm({
          brand_name:          data.brand_name          || '',
          brand_logo_url:      data.brand_logo_url      || '',
          brand_favicon_url:   data.brand_favicon_url   || '',
          brand_primary_color: data.brand_primary_color || '',
          brand_support_email: data.brand_support_email || '',
          custom_domain:       data.custom_domain       || '',
        })
      }
      return data
    },
  })

  const saveBranding = async () => {
    setSavingBrand(true)
    const patch = {
      brand_name:          brandForm.brand_name          || null,
      brand_logo_url:      brandForm.brand_logo_url      || null,
      brand_favicon_url:   brandForm.brand_favicon_url   || null,
      brand_primary_color: /^#[0-9a-fA-F]{6}$/.test(brandForm.brand_primary_color)
                             ? brandForm.brand_primary_color : null,
      brand_support_email: brandForm.brand_support_email || null,
      custom_domain:       brandForm.custom_domain       || null,
    }
    const { error } = await supabase
      .from('la_organizations')
      .update(patch)
      .eq('id', profile.org_id)
    setSavingBrand(false)
    if (error) { toast.error(error.message); return }
    // Apply color live so the admin can see the effect immediately
    if (patch.brand_primary_color) applyPalette(patch.brand_primary_color)
    toast.success('Branding saved')
    qc.invalidateQueries({ queryKey: ['org-branding', profile.org_id] })
  }

  const disconnectProvider = async (provider) => {
    if (!confirm(`Disconnect ${provider === 'quickbooks' ? 'QuickBooks' : 'Clio'}? Push buttons will stop working.`)) return
    const { error } = await supabase
      .from('la_accounting_connections')
      .update({ is_active: false })
      .eq('org_id', profile.org_id)
      .eq('provider', provider)
    if (error) { toast.error(error.message); return }
    toast.success('Disconnected')
    qc.invalidateQueries({ queryKey: ['accounting-connections'] })
  }

  const qboConn  = accountingConnections.find(c => c.provider === 'quickbooks' && c.is_active)
  const clioConn = accountingConnections.find(c => c.provider === 'clio' && c.is_active)

  const { data: orgs = [] } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: async () => {
      let q = supabase.from('la_organizations').select('*, la_profiles(count)').order('created_at', { ascending: false })
      if (!isPlatformAdmin) q = q.eq('id', profile?.org_id)
      const { data } = await q
      return data || []
    }
  })

  // Bootstrap: check if any platform admins exist yet
  const { data: existingPlatformAdmins = [] } = useQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_profiles')
        .select('id')
        .eq('is_platform_admin', true)
      return data || []
    }
  })

  const noPlatformAdminsYet = existingPlatformAdmins.length === 0

  const roleColors = {
    admin:  'bg-brand-100 text-brand-700',
    client: 'bg-blue-100 text-blue-700',
    user:   'bg-slate-100 text-slate-600',
  }

  const deleteOrg = async (org) => {
    const userCount = users.filter(u => u.org_id === org.id).length
    const warning = userCount > 0
      ? `Delete "${org.name}"?\n\nThis org has ${userCount} user${userCount !== 1 ? 's' : ''} — they will be left without an organization.\n\nAll matters, invoices, and apportionments for this org will be permanently deleted. This cannot be undone.`
      : `Delete "${org.name}"?\n\nAll matters, invoices, and apportionments for this org will be permanently deleted. This cannot be undone.`
    if (!confirm(warning)) return
    const { error } = await supabase.from('la_organizations').delete().eq('id', org.id)
    if (error) { toast.error(error.message); return }
    toast.success(`"${org.name}" deleted`)
    qc.invalidateQueries({ queryKey: ['admin-orgs'] })
    qc.invalidateQueries({ queryKey: ['admin-users', 'all'] })
  }

  const adminUpdateProfile = async (targetUserId, patch) => {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('admin-update-profile', {
      body: { target_user_id: targetUserId, patch },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    })
    if (error) {
      const body = await error.context?.json?.().catch(() => null)
      throw new Error(body?.error || error.message || 'Update failed')
    }
    if (data?.error) throw new Error(data.error)
    return data
  }

  const changeRole = async (userId, role) => {
    try {
      await adminUpdateProfile(userId, { role })
      toast.success('Role updated')
      qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
    } catch (err) { toast.error(err.message) }
  }

  const changeOrg = async (userId, orgId) => {
    try {
      await adminUpdateProfile(userId, { org_id: orgId })
      // Also clear insurer assignment since it's org-specific
      await supabase.from('la_profiles').update({ insurer_id: null }).eq('id', userId)
      toast.success('Organization updated')
      qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
    } catch (err) { toast.error(err.message) }
  }

  const assignInsurer = async (userId, insurer_id) => {
    // Immediately show the new value in the dropdown via local state
    setPendingInsurers(prev => ({ ...prev, [userId]: insurer_id || null }))
    const { error } = await supabase
      .from('la_profiles')
      .update({ insurer_id: insurer_id || null })
      .eq('id', userId)
    if (error) {
      toast.error(error.message)
      // Roll back optimistic value
      setPendingInsurers(prev => { const next = { ...prev }; delete next[userId]; return next })
      return
    }
    toast.success('Insurer assigned')
    // Refetch so the underlying query data is fresh; clear pending entry after
    await qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
    setPendingInsurers(prev => { const next = { ...prev }; delete next[userId]; return next })
  }

  const handleDeleteUser = async (u) => {
    const label = u.first_name ? `${u.first_name} ${u.last_name ?? ''}`.trim() : u.email
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { target_user_id: u.id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      toast.success(`${label} removed.`)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) {
      toast.error(err.message || 'Failed to delete user')
    }
  }

  const togglePlatformAdmin = async (userId, current) => {
    if (userId === profile?.id && current) {
      toast.error("Can't remove your own DB Admin status")
      return
    }
    try {
      await adminUpdateProfile(userId, { is_platform_admin: !current })
      toast.success(current ? 'DB Admin revoked' : 'DB Admin granted')
      qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
      qc.invalidateQueries({ queryKey: ['platform-admins'] })
    } catch (err) { toast.error(err.message) }
  }

  const claimPlatformAdmin = async () => {
    const { error } = await supabase
      .from('la_profiles')
      .update({ is_platform_admin: true })
      .eq('id', profile?.id)
    if (error) { toast.error(error.message); return }
    toast.success('DB Admin claimed — refreshing…')
    await refetchProfile()
    qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
    qc.invalidateQueries({ queryKey: ['platform-admins'] })
  }

  const insurersForOrg = (orgId) => insurers.filter(i => i.org_id === orgId)

  const orgCount  = orgs.length
  const userCount = users.length

  const { data: paymentStats } = useQuery({
    queryKey: ['platform-payment-stats'],
    enabled:  isPlatformAdmin,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('la_insurer_apportionments')
        .select('amount_paid')
        .eq('payment_status', 'paid')
      if (error) throw error
      const total = (data || []).reduce((s, r) => s + Number(r.amount_paid || 0), 0)
      return { total, fee: total * 0.03 }
    },
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
              {isPlatformAdmin && (
                <span className="flex items-center gap-1 badge bg-violet-100 text-violet-700 text-xs font-semibold">
                  <Database className="h-3 w-3" /> DB Admin
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm">
              {isPlatformAdmin
                ? `${userCount} users across ${orgCount} organization${orgCount !== 1 ? 's' : ''} (platform-wide)`
                : `Manage users and settings for your organization`}
            </p>
          </div>
        </div>

        {/* Bootstrap claim button — only shows when nobody is platform admin yet */}
        {noPlatformAdminsYet && profile?.role === 'admin' && !isPlatformAdmin && (
          <button
            onClick={claimPlatformAdmin}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
          >
            <Database className="h-4 w-4" /> Claim DB Admin
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.filter(t => !t.dbAdminOnly || isPlatformAdmin).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ── */}
      {tab === 'profile' && (
        <div className="max-w-lg">
          <div className="card">
            <div className="flex items-center gap-2 p-5 border-b border-slate-100">
              <User className="h-4 w-4 text-brand-600" />
              <h2 className="font-semibold text-slate-900">Profile</h2>
            </div>
            <form onSubmit={handleProfileSubmit(onSaveProfile)} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">First Name</label>
                  <input className="form-input" {...regProfile('first_name')} />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input className="form-input" {...regProfile('last_name')} />
                </div>
              </div>
              <div>
                <label className="form-label">
                  Email {isAdmin && <span className="text-brand-600 text-xs ml-1">(admin editable)</span>}
                </label>
                {isAdmin ? (
                  <input className="form-input" type="email" {...regProfile('email')} />
                ) : (
                  <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed" value={profile?.email || ''} disabled />
                )}
                {isAdmin && <p className="text-xs text-slate-400 mt-1">Changing email sends a confirmation link to the new address.</p>}
              </div>
              <div>
                <label className="form-label">
                  Role {isAdmin && <span className="text-brand-600 text-xs ml-1">(admin editable)</span>}
                </label>
                {isAdmin ? (
                  <select className="form-input" {...regProfile('role')}>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                    <option value="client">Client</option>
                  </select>
                ) : (
                  <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed capitalize" value={profile?.role || ''} disabled />
                )}
              </div>
              <button type="submit" className="btn-primary" disabled={isProfileSubmitting}>
                {isProfileSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Security Tab ── */}
      {tab === 'security' && (
        <div className="max-w-lg space-y-6">
          {/* 2FA */}
          <div className="card">
            <div className="flex items-center gap-2 p-5 border-b border-slate-100">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <h2 className="font-semibold text-slate-900">Two-Factor Authentication</h2>
              {hasTOTP && (
                <span className="ml-auto badge bg-green-100 text-green-700 text-xs">
                  <CheckCircle2 className="h-3 w-3 inline mr-0.5" /> Enabled
                </span>
              )}
            </div>
            <div className="p-5">
              {hasTOTP ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800 text-sm">2FA is active on your account</p>
                      <p className="text-xs text-green-700 mt-0.5">You'll be prompted for a code each time you sign in.</p>
                    </div>
                  </div>
                  <button onClick={handleDisable2FA} disabled={disabling2FA} className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200">
                    {disabling2FA ? <><Loader2 className="h-4 w-4 animate-spin" /> Disabling…</> : <><ShieldOff className="h-4 w-4" /> Disable Two-Factor Authentication</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 text-sm">2FA is not enabled</p>
                      <p className="text-xs text-amber-700 mt-0.5">Adds a second layer of security to your account.</p>
                    </div>
                  </div>
                  <button onClick={() => setShowEnroll(true)} className="btn-primary">
                    <QrCode className="h-4 w-4" /> Enable Two-Factor Authentication
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="card">
            <div className="flex items-center gap-2 p-5 border-b border-slate-100">
              <Lock className="h-4 w-4 text-brand-600" />
              <h2 className="font-semibold text-slate-900">Change Password</h2>
            </div>
            <form onSubmit={handlePwd(onChangePassword)} className="p-5 space-y-4">
              <div>
                <label className="form-label">New Password</label>
                <input type="password" className="form-input" placeholder="Min. 8 characters"
                  {...regPwd('password', { required: true, minLength: 8 })} />
              </div>
              <button type="submit" className="btn-primary" disabled={isPwdSubmitting}>
                {isPwdSubmitting ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Users Tab ── */}
      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {userCount} user{userCount !== 1 ? 's' : ''}
              {isPlatformAdmin && ` across ${orgCount} org${orgCount !== 1 ? 's' : ''}`}
            </p>
            <button onClick={() => setShowInvite(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Invite User
            </button>
          </div>

          {/* Role sub-tabs */}
          {(() => {
            const roleTabs = [
              { key: 'user',   label: 'Users',   count: users.filter(u => u.role === 'user').length   },
              { key: 'admin',  label: 'Admins',  count: users.filter(u => u.role === 'admin').length  },
              { key: 'client', label: 'Clients', count: users.filter(u => u.role === 'client').length },
            ]
            const filteredUsers = users.filter(u => u.role === userRoleTab)
            const isClientTab   = userRoleTab === 'client'

            return (
              <>
                <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
                  {roleTabs.map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => setUserRoleTab(key)}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        userRoleTab === key
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {label}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                        userRoleTab === key ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-500'
                      }`}>{count}</span>
                    </button>
                  ))}
                </div>

                <div className="card overflow-x-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No {userRoleTab}s yet</p>
                    </div>
                  ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Name</th>
                        <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Email</th>
                        {isPlatformAdmin && (
                          <th className="hidden md:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Organization</th>
                        )}
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Role</th>
                        {isClientTab && (
                          <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer</th>
                        )}
                        {isPlatformAdmin && userRoleTab === 'admin' && (
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">DB Admin</th>
                        )}
                        <th className="hidden md:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Joined</th>
                        {isPlatformAdmin && (
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Logins</th>
                        )}
                        {isPlatformAdmin && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{u.first_name} {u.last_name}</span>
                        {u.id === profile?.id && <span className="text-xs text-slate-400">(you)</span>}
                        {u.is_platform_admin && (
                          <span className="flex items-center gap-0.5 badge bg-violet-100 text-violet-700 text-xs">
                            <Database className="h-2.5 w-2.5" /> DB
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-500">{u.email}</td>
                    {isPlatformAdmin && (
                      <td className="hidden md:table-cell px-4 py-4">
                        <select
                          value={u.org_id || ''}
                          onChange={e => changeOrg(u.id, e.target.value)}
                          disabled={u.id === profile?.id}
                          className="form-input text-xs py-1 px-2 h-auto min-w-[160px] disabled:opacity-50"
                        >
                          {orgs.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-4 py-4">
                      {isPlatformAdmin ? (
                        <select
                          value={u.role}
                          onChange={e => changeRole(u.id, e.target.value)}
                          disabled={u.id === profile?.id}
                          className={`badge border-0 cursor-pointer ${roleColors[u.role] || 'bg-slate-100 text-slate-600'}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="client">Client</option>
                          <option value="user">User</option>
                        </select>
                      ) : (
                        <span className={`badge ${roleColors[u.role] || 'bg-slate-100 text-slate-600'}`}>
                          {u.role}
                        </span>
                      )}
                    </td>
                    {isClientTab && (
                      <td className="hidden sm:table-cell px-4 py-4">
                        <select
                          value={
                            u.id in pendingInsurers
                              ? (pendingInsurers[u.id] || '')
                              : (u.insurer_id || '')
                          }
                          onChange={e => assignInsurer(u.id, e.target.value)}
                          className="form-input text-xs py-1 px-2 h-auto min-w-[160px]"
                        >
                          <option value="">— unassigned —</option>
                          {isPlatformAdmin ? (
                            // DB Admins see all insurers across every org, grouped by org
                            orgs.map(org => {
                              const orgInsurers = insurers.filter(i => i.org_id === org.id)
                              if (orgInsurers.length === 0) return null
                              return (
                                <optgroup key={org.id} label={org.name}>
                                  {orgInsurers.map(ins => (
                                    <option key={ins.id} value={ins.id}>{ins.name}</option>
                                  ))}
                                </optgroup>
                              )
                            })
                          ) : (
                            // Org admins see only their own org's insurers
                            insurersForOrg(u.org_id).map(ins => (
                              <option key={ins.id} value={ins.id}>{ins.name}</option>
                            ))
                          )}
                        </select>
                      </td>
                    )}
                    {isPlatformAdmin && userRoleTab === 'admin' && (
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => togglePlatformAdmin(u.id, u.is_platform_admin)}
                          disabled={u.id === profile?.id && u.is_platform_admin}
                          title={u.is_platform_admin ? 'Revoke DB Admin' : 'Grant DB Admin'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.is_platform_admin
                              ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                              : 'text-slate-300 hover:text-violet-500 hover:bg-violet-50'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          <Database className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                    <td className="hidden md:table-cell px-4 py-4 text-sm text-slate-400">
                      {u.created_at ? format(parseISO(u.created_at), 'MM/dd/yyyy') : '—'}
                    </td>
                    {isPlatformAdmin && (
                      <td className="px-4 py-4 text-center text-sm font-medium text-slate-600">
                        {u.login_count ?? 0}
                      </td>
                    )}
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleDeleteUser(u)}
                        disabled={u.id === profile?.id}
                        title="Remove user"
                        className="text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                      ))}
                    </tbody>
                  </table>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── Orgs Tab ── */}
      {tab === 'orgs' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{orgCount} organization{orgCount !== 1 ? 's' : ''}</p>
            {isPlatformAdmin && (
              <button onClick={() => setShowAddOrg(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Add Organization
              </button>
            )}
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Organization</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Users</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Created</th>
                  {isPlatformAdmin && (
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgs.map(org => {
                  const orgUsers = users.filter(u => u.org_id === org.id)
                  return (
                    <tr
                      key={org.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedOrg(org)}
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-800">
                          {org.name}
                          {org.id === profile?.org_id && (
                            <span className="ml-2 text-xs text-brand-600 font-semibold">(your org)</span>
                          )}
                        </p>
                        {orgUsers.length > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {orgUsers.map(u =>
                              (u.first_name || u.last_name)
                                ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                                : u.email
                            ).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`badge ${orgUsers.length > 0 ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'}`}>
                          {orgUsers.length} user{orgUsers.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-400">
                        {org.created_at ? format(parseISO(org.created_at), 'MM/dd/yyyy') : '—'}
                      </td>
                      {isPlatformAdmin && (
                        <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setAssignModal(org)}
                              className="btn-secondary text-xs py-1.5 px-3"
                            >
                              <UserPlus className="h-3.5 w-3.5" /> Assign User
                            </button>
                            <button
                              onClick={() => deleteOrg(org)}
                              disabled={org.id === profile?.org_id}
                              className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-1.5 rounded hover:bg-red-50"
                              title={org.id === profile?.org_id ? 'Cannot delete your own org' : 'Delete organization'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Integrations Tab ── */}
      {tab === 'integrations' && (
        <div className="max-w-2xl space-y-6">
          <div>
            <h2 className="font-semibold text-slate-900 mb-1">Accounting Integrations</h2>
            <p className="text-sm text-slate-500">
              Connect QuickBooks Online or Clio to push paid apportionment amounts directly to your books.
              Once connected, a "Push to Books" button appears on paid insurer obligations.
            </p>
          </div>

          {/* Setup notice if client IDs not configured */}
          {(!QBO_CLIENT_ID && !CLIO_CLIENT_ID) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold mb-1">Developer setup required</p>
                <p>Add <code className="font-mono bg-amber-100 px-1 rounded">VITE_QBO_CLIENT_ID</code> / <code className="font-mono bg-amber-100 px-1 rounded">VITE_CLIO_CLIENT_ID</code> to your Netlify environment variables, and the corresponding secrets to Supabase Edge Functions. See migration 014 for the full list.</p>
              </div>
            </div>
          )}

          {/* QuickBooks card */}
          {[
            {
              key:         'quickbooks',
              name:        'QuickBooks Online',
              description: 'Pushes each paid obligation as a Deposit transaction to your QBO company.',
              docsUrl:     'https://developer.intuit.com/app/developer/qbo/docs/get-started',
              conn:        qboConn,
              canConnect:  !!QBO_CLIENT_ID,
              iconBg:      'bg-emerald-50',
              iconColor:   'text-emerald-700',
              accentColor: 'border-emerald-200',
            },
            {
              key:         'clio',
              name:        'Clio',
              description: 'Creates a payment note in Clio under the linked matter when an obligation is paid.',
              docsUrl:     'https://app.clio.com/api/v4/documentation',
              conn:        clioConn,
              canConnect:  !!CLIO_CLIENT_ID,
              iconBg:      'bg-blue-50',
              iconColor:   'text-blue-700',
              accentColor: 'border-blue-200',
            },
          ].map(({ key, name, description, docsUrl, conn, canConnect, iconBg, iconColor, accentColor }) => (
            <div key={key} className={`card p-5 border ${conn ? accentColor : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                    <Plug className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{name}</p>
                      {conn ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Not connected</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                    {conn && (
                      <p className="text-xs text-slate-400 mt-1">
                        Connected {format(parseISO(conn.connected_at), 'MMM d, yyyy')}
                        {conn.realm_id ? ` · ID: ${conn.realm_id}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={docsUrl} target="_blank" rel="noopener noreferrer"
                    className="btn-secondary text-xs py-1.5 px-3">
                    <ExternalLink className="h-3.5 w-3.5" /> Docs
                  </a>
                  {conn ? (
                    <button onClick={() => disconnectProvider(key)}
                      className="btn-secondary text-xs py-1.5 px-3 text-red-600 border-red-200 hover:bg-red-50">
                      Disconnect
                    </button>
                  ) : canConnect ? (
                    <a href={buildOAuthURL(key, profile?.org_id)} className="btn-primary text-xs py-1.5 px-3">
                      <Plug className="h-3.5 w-3.5" /> Connect
                    </a>
                  ) : (
                    <button disabled className="btn-secondary text-xs py-1.5 px-3 opacity-50 cursor-not-allowed">
                      Setup required
                    </button>
                  )}
                </div>
              </div>

              {/* Post-connect settings */}
              {conn && (
                <IntegrationSettingsForm
                  conn={conn}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['accounting-connections'] })}
                />
              )}
            </div>
          ))}

          {/* ── FileVine (API key — no OAuth) ── */}
          <FileVineConnectionCard orgId={profile?.org_id} />

          {/* Setup guide */}
          <details className="card p-5 cursor-pointer">
            <summary className="font-medium text-slate-700 flex items-center gap-2 select-none">
              <Settings2 className="h-4 w-4 text-slate-400" />
              Developer setup guide
            </summary>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <p className="font-semibold text-slate-800 mb-1">QuickBooks Online</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Create an app at <a href="https://developer.intuit.com" target="_blank" className="text-brand-600 hover:underline">developer.intuit.com</a></li>
                  <li>Add <code className="font-mono bg-slate-100 px-1 rounded">{`{SUPABASE_URL}/functions/v1/accounting-oauth-callback`}</code> as a Redirect URI</li>
                  <li>Copy Client ID → Netlify env: <code className="font-mono bg-slate-100 px-1 rounded">VITE_QBO_CLIENT_ID</code></li>
                  <li>Copy Client Secret + Client ID → Supabase secrets: <code className="font-mono bg-slate-100 px-1 rounded">QBO_CLIENT_ID</code>, <code className="font-mono bg-slate-100 px-1 rounded">QBO_CLIENT_SECRET</code>, <code className="font-mono bg-slate-100 px-1 rounded">QBO_REDIRECT_URI</code></li>
                  <li>Set <code className="font-mono bg-slate-100 px-1 rounded">QBO_ENVIRONMENT</code> to <code className="font-mono bg-slate-100 px-1 rounded">sandbox</code> or <code className="font-mono bg-slate-100 px-1 rounded">production</code></li>
                  <li>Also set <code className="font-mono bg-slate-100 px-1 rounded">VITE_QBO_REDIRECT_URI</code> in Netlify</li>
                </ol>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">Clio</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Create an app at <a href="https://app.clio.com/settings/developer_applications" target="_blank" className="text-brand-600 hover:underline">Clio Developer Settings</a></li>
                  <li>Add the same callback URL as redirect URI</li>
                  <li>Copy Client ID → Netlify: <code className="font-mono bg-slate-100 px-1 rounded">VITE_CLIO_CLIENT_ID</code></li>
                  <li>Copy both to Supabase: <code className="font-mono bg-slate-100 px-1 rounded">CLIO_CLIENT_ID</code>, <code className="font-mono bg-slate-100 px-1 rounded">CLIO_CLIENT_SECRET</code>, <code className="font-mono bg-slate-100 px-1 rounded">CLIO_REDIRECT_URI</code></li>
                  <li>Once connected, use Clio for <strong>both</strong> payment push and matter import — same token.</li>
                </ol>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">FileVine</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>In FileVine: Settings → API Keys → generate a new key</li>
                  <li>Note your <strong>Org ID</strong> (visible in your FileVine URL: <code className="font-mono bg-slate-100 px-1 rounded">app.filevine.io/org/&#123;orgId&#125;</code>)</li>
                  <li>Note your <strong>User ID</strong> (FileVine API → Whoami, or your profile URL)</li>
                  <li>Enter all three directly in the FileVine card above — no OAuth required</li>
                </ol>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── Billing Tab ── */}

      {/* ── API Tab ── */}
      {tab === 'api' && (
        <div className="max-w-3xl space-y-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">API Keys</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Authenticate programmatic access to LexAlloc data. Keys are shown once — store them securely.
              </p>
            </div>
            <button onClick={() => setShowCreateKey(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="h-4 w-4" /> New API Key
            </button>
          </div>

          {/* Key list */}
          {apiKeys.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              <Key className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p>No API keys yet.</p>
              <p className="text-xs mt-1">Create a key to start pushing invoices or pulling apportionment results programmatically.</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-100">
              {apiKeys.map(k => (
                <div key={k.id} className={`flex items-center gap-4 px-5 py-4 ${!k.is_active ? 'opacity-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.is_active ? 'bg-brand-100' : 'bg-slate-100'}`}>
                    <Key className={`h-4 w-4 ${k.is_active ? 'text-brand-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 text-sm">{k.name}</p>
                      {!k.is_active && <span className="badge bg-red-100 text-red-600 text-xs">Revoked</span>}
                      {k.expires_at && new Date(k.expires_at) < new Date() && (
                        <span className="badge bg-amber-100 text-amber-700 text-xs">Expired</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-slate-400 font-mono tracking-wider">
                        {revealedKeys.has(k.id)
                          ? <>{k.key_prefix}<span className="opacity-40">••••••••••••••••</span></>
                          : '••••••••••••••••••••••••••••••••'
                        }
                      </p>
                      <button
                        onClick={() => toggleKeyReveal(k.id)}
                        title={revealedKeys.has(k.id) ? 'Hide key prefix' : 'Show key prefix'}
                        className="text-slate-300 hover:text-slate-600 transition-colors flex-shrink-0"
                      >
                        {revealedKeys.has(k.id)
                          ? <EyeOff className="h-3.5 w-3.5" />
                          : <Eye className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {(k.scopes || []).map(s => (
                        <span key={s} className="badge bg-slate-100 text-slate-600 text-xs">{s}</span>
                      ))}
                      <span className="text-xs text-slate-400">
                        Created {format(new Date(k.created_at), 'MMM d, yyyy')} by {k.created_by_email}
                      </span>
                      {k.last_used_at && (
                        <span className="text-xs text-slate-400">
                          Last used {format(new Date(k.last_used_at), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  {k.is_active && (
                    <button
                      onClick={() => revokeApiKey(k.id, k.name)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* API Reference */}
          <details className="card p-5 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700 flex items-center gap-2 select-none">
              <Code className="h-4 w-4 text-slate-400" />
              API Reference
            </summary>
            <div className="mt-5 space-y-5 text-slate-600">
              <div>
                <p className="font-semibold text-slate-800 mb-1">Authentication</p>
                <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs overflow-x-auto font-mono">{`Authorization: Bearer lx_live_your_key_here`}</pre>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-2">Base URL</p>
                <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs overflow-x-auto font-mono">{`${import.meta.env.VITE_API_URL || 'https://your-railway-app.up.railway.app'}/v1`}</pre>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-2">Endpoints</p>
                <div className="space-y-2">
                  {[
                    { method: 'GET',  path: '/v1/',                              desc: 'API info + available endpoints',           scope: 'any'           },
                    { method: 'GET',  path: '/v1/matters',                       desc: 'List matters (supports ?page, ?search)',   scope: 'read'          },
                    { method: 'GET',  path: '/v1/matters/:id',                   desc: 'Matter detail with parties + insurers',    scope: 'read'          },
                    { method: 'GET',  path: '/v1/matters/:id/parties',           desc: 'Parties on a matter',                      scope: 'read'          },
                    { method: 'GET',  path: '/v1/matters/:id/invoices',          desc: 'Invoices on a matter',                     scope: 'read'          },
                    { method: 'POST', path: '/v1/matters/:id/invoices',          desc: 'Push a new invoice programmatically',      scope: 'write:invoices'},
                    { method: 'GET',  path: '/v1/matters/:id/apportionments',    desc: 'List apportionments on a matter',          scope: 'read'          },
                    { method: 'GET',  path: '/v1/apportionments/:id',            desc: 'Full apportionment result with all breakdowns', scope: 'read'     },
                  ].map(e => (
                    <div key={e.path} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50">
                      <span className={`badge text-xs font-mono flex-shrink-0 mt-0.5 ${e.method === 'GET' ? 'bg-sky-100 text-sky-700' : 'bg-green-100 text-green-700'}`}>{e.method}</span>
                      <code className="text-xs text-slate-700 font-mono flex-1">{e.path}</code>
                      <span className="text-xs text-slate-500 flex-1">{e.desc}</span>
                      <span className="badge bg-slate-100 text-slate-500 text-xs flex-shrink-0">{e.scope}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">Scopes</p>
                <div className="space-y-1 text-xs">
                  {[
                    { scope: 'read',           desc: 'Read matters, parties, insurers, invoices, apportionments' },
                    { scope: 'write:invoices', desc: 'Push new invoices to a matter via POST' },
                    { scope: 'write',          desc: 'All write access including invoices' },
                  ].map(s => (
                    <div key={s.scope} className="flex gap-3">
                      <code className="font-mono text-brand-700 bg-brand-50 px-1.5 rounded w-32 flex-shrink-0">{s.scope}</code>
                      <span className="text-slate-500">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">Rate limits</p>
                <p className="text-xs text-slate-500">600 requests per 10 minutes per API key. Rate limit headers are returned with every response.</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-2">Example — pull apportionment result</p>
                <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs overflow-x-auto font-mono whitespace-pre">{`curl -H "Authorization: Bearer lx_live_..." \\
  "${import.meta.env.VITE_API_URL || 'https://your-app.railway.app'}/v1/apportionments/YOUR_ID"`}</pre>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── Branding Tab ── */}
      {tab === 'branding' && (
        <div className="max-w-2xl space-y-6">
          <div>
            <h2 className="font-semibold text-slate-900">White-Label Branding</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Customize how LexAlloc looks for your organization. Changes apply immediately after saving.
              On a custom domain, the login page picks up your branding before users sign in.
            </p>
          </div>

          <div className="card p-6 space-y-5">
            {/* Brand name */}
            <div>
              <label className="form-label">Brand / App Name</label>
              <input
                className="form-input"
                placeholder="BigLaw Apportionment"
                value={brandForm.brand_name}
                onChange={e => setBrandForm(f => ({ ...f, brand_name: e.target.value }))}
              />
              <p className="text-xs text-slate-400 mt-1">Replaces "LexAlloc" in the sidebar and login page.</p>
            </div>

            {/* Logo URL */}
            <div>
              <label className="form-label">Logo URL</label>
              <input
                className="form-input"
                placeholder="https://cdn.yourfirm.com/logo.svg"
                value={brandForm.brand_logo_url}
                onChange={e => setBrandForm(f => ({ ...f, brand_logo_url: e.target.value }))}
              />
              {brandForm.brand_logo_url && (
                <div className="mt-2 p-3 bg-slate-900 rounded-lg inline-block">
                  <img
                    src={brandForm.brand_logo_url}
                    alt="Logo preview"
                    className="h-12 w-auto max-w-xs"
                    onError={e => { e.target.style.display = 'none' }}
                    onLoad={e  => { e.target.style.display = 'block' }}
                  />
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">Shown in the sidebar and on the login page. SVG or PNG recommended.</p>
            </div>

            {/* Favicon URL */}
            <div>
              <label className="form-label">Favicon URL</label>
              <input
                className="form-input"
                placeholder="https://cdn.yourfirm.com/favicon.ico"
                value={brandForm.brand_favicon_url}
                onChange={e => setBrandForm(f => ({ ...f, brand_favicon_url: e.target.value }))}
              />
              <p className="text-xs text-slate-400 mt-1">Browser tab icon. 32×32 or 64×64 PNG/ICO works best.</p>
            </div>

            {/* Primary color */}
            <div>
              <label className="form-label">Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-16 rounded cursor-pointer border border-slate-200 p-0.5"
                  value={/^#[0-9a-fA-F]{6}$/.test(brandForm.brand_primary_color) ? brandForm.brand_primary_color : '#4f46e5'}
                  onChange={e => {
                    setBrandForm(f => ({ ...f, brand_primary_color: e.target.value }))
                    setColorPreviewErr(false)
                  }}
                />
                <input
                  className="form-input font-mono flex-1"
                  placeholder="#4f46e5"
                  value={brandForm.brand_primary_color}
                  onChange={e => {
                    const v = e.target.value
                    setBrandForm(f => ({ ...f, brand_primary_color: v }))
                    setColorPreviewErr(false)
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyPalette(v)
                  }}
                />
                {brandForm.brand_primary_color && (
                  <div
                    className="w-10 h-10 rounded-lg border border-slate-200 flex-shrink-0"
                    style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandForm.brand_primary_color) ? brandForm.brand_primary_color : 'transparent' }}
                  />
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">6-digit hex, e.g. <code>#1e40af</code>. Updates buttons and accents across the app.</p>
              {colorPreviewErr && <p className="text-xs text-red-500 mt-1">Enter a valid hex color (#rrggbb)</p>}
            </div>

            {/* Support email */}
            <div>
              <label className="form-label">Support Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="support@yourfirm.com"
                value={brandForm.brand_support_email}
                onChange={e => setBrandForm(f => ({ ...f, brand_support_email: e.target.value }))}
              />
              <p className="text-xs text-slate-400 mt-1">Shown on the login page so users know who to contact.</p>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={saveBranding}
                disabled={savingBrand}
                className="btn-primary flex items-center gap-2"
              >
                {savingBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
                {savingBrand ? 'Saving…' : 'Save Branding'}
              </button>
            </div>
          </div>

          {/* Custom domain section */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-slate-900">Custom Domain</h3>
              <span className="badge bg-purple-100 text-purple-700 text-xs">Enterprise</span>
            </div>
            <p className="text-sm text-slate-500">
              Run LexAlloc under your own domain (e.g. <code className="bg-slate-100 px-1 rounded text-slate-700">apportionment.biglaw.com</code>).
              Your branding will load on the login page before users authenticate.
            </p>

            <div>
              <label className="form-label">Custom Domain</label>
              <input
                className="form-input font-mono"
                placeholder="apportionment.yourfirm.com"
                value={brandForm.custom_domain}
                onChange={e => setBrandForm(f => ({ ...f, custom_domain: e.target.value.toLowerCase().trim() }))}
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={saveBranding}
                disabled={savingBrand}
                className="btn-primary flex items-center gap-2"
              >
                {savingBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                {savingBrand ? 'Saving…' : 'Save Domain'}
              </button>
            </div>
          </div>

          {/* DNS setup guide */}
          <details className="card p-5 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700 flex items-center gap-2 select-none">
              <Settings2 className="h-4 w-4 text-slate-400" />
              DNS setup instructions
            </summary>
            <div className="mt-4 space-y-4 text-slate-600">
              <p>
                To point your custom domain to LexAlloc, add a <strong>CNAME</strong> record in your DNS provider:
              </p>
              <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-xs space-y-1">
                <p><span className="text-slate-400">Type:</span>  CNAME</p>
                <p><span className="text-slate-400">Name:</span>  apportionment <span className="text-slate-500">(or your subdomain)</span></p>
                <p><span className="text-slate-400">Value:</span> {window.location.hostname.includes('netlify') ? window.location.hostname : 'your-site.netlify.app'}</p>
                <p><span className="text-slate-400">TTL:</span>   3600</p>
              </div>
              <p className="text-xs text-slate-400">
                After DNS propagates (up to 48 hours), add the domain in your Netlify site settings under <strong>Domain management → Add custom domain</strong>.
                Netlify will provision an SSL certificate automatically.
              </p>
              <p className="text-xs text-slate-400">
                Once the domain is live, enter it above and save. LexAlloc will detect the hostname and apply your branding on the login page.
              </p>
            </div>
          </details>
        </div>
      )}

      {/* ── Demo Data Tab ─────────────────────────────────────────────────── */}
      {tab === 'demo' && isPlatformAdmin && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                <Wand2 className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Demo Data Generator</h3>
                <p className="text-sm text-slate-500">Populate your account with realistic sample data for demos and testing.</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-6 text-sm text-slate-600 space-y-1">
              <p className="font-medium text-slate-700 mb-2">What gets created:</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                <span>✦ 8 demo law firms</span>
                <span>✦ 20 demo matters assigned across firms</span>
                <span>✦ Uses your actual Rolodex insurers</span>
                <span>✦ 2–3 insurer policy periods per party</span>
                <span>✦ 1–3 invoices per matter with real line items</span>
                <span>✦ Mixed payment statuses &amp; amounts</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">All demo records are tagged <code className="bg-slate-200 px-1 rounded">[DEMO]</code> and can be cleared at any time. Requires at least one insurer in your Rolodex. Matters are fully configured — open any one and click <strong>Run Apportionment</strong> or ask the <strong>AI Advisor</strong>.</p>
            </div>

            {demoProgress && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-violet-50 rounded-lg">
                <Loader2 className="h-4 w-4 text-violet-600 animate-spin flex-shrink-0" />
                <p className="text-sm text-violet-700">{demoProgress}</p>
              </div>
            )}

            {demoStats && (
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Matters',        value: demoStats.matters },
                  { label: 'Invoices',       value: demoStats.invoices },
                  { label: 'Line Items',     value: demoStats.lineItems },
                  { label: 'Parties',        value: demoStats.parties },
                  { label: 'Policy Periods', value: demoStats.policyPeriods },
                  { label: 'Apportionments', value: demoStats.apportionments },
                  { label: 'Paid',           value: demoStats.paid,     color: 'text-green-600' },
                  { label: 'Demanded',       value: demoStats.demanded, color: 'text-red-500'   },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className={`text-xl font-bold ${s.color ?? 'text-slate-900'}`}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={generateDemoData}
                disabled={demoGenerating || demoClearing}
                className="btn-primary flex items-center gap-2"
              >
                {demoGenerating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                  : <><Wand2 className="h-4 w-4" /> Generate Demo Data</>
                }
              </button>
              <button
                onClick={clearDemoData}
                disabled={demoGenerating || demoClearing}
                className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                {demoClearing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Clearing…</>
                  : <><Trash2 className="h-4 w-4" /> Clear Demo Data</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create API Key Modal */}
      {showCreateKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="font-semibold text-lg flex items-center gap-2"><Key className="h-4 w-4 text-brand-600" /> New API Key</h2>
              <button onClick={() => setShowCreateKey(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">Key Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. DMS Integration, Reporting Dashboard"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label">Scopes</label>
                <div className="space-y-2">
                  {[
                    { value: 'read',           label: 'Read',           desc: 'Read matters, apportionments, invoices' },
                    { value: 'write:invoices', label: 'Write: Invoices',desc: 'Push invoices programmatically' },
                    { value: 'write',          label: 'Write (all)',    desc: 'All write access' },
                  ].map(s => (
                    <label key={s.value} className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(s.value)}
                        onChange={e => setNewKeyScopes(prev =>
                          e.target.checked ? [...prev, s.value] : prev.filter(x => x !== s.value)
                        )}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{s.label}</p>
                        <p className="text-xs text-slate-500">{s.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Expiry Date <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="date" className="form-input" value={newKeyExpiry} onChange={e => setNewKeyExpiry(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-6 border-t border-slate-200">
              <button onClick={() => setShowCreateKey(false)} className="btn-secondary text-sm">Cancel</button>
              <button
                onClick={generateApiKey}
                disabled={creatingKey || !newKeyName.trim() || newKeyScopes.length === 0}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {creatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                Generate Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show-once key reveal modal */}
      {newKeyResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="font-semibold text-lg flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" /> API Key Created
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600" />
                <p><strong>Copy this key now.</strong> It won't be shown again. Store it in a secrets manager or environment variable.</p>
              </div>
              <div>
                <label className="form-label">{newKeyResult.name}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={newKeyResult.key}
                    className="form-input font-mono text-xs flex-1 bg-slate-50"
                    onFocus={e => e.target.select()}
                  />
                  <button
                    onClick={() => copyToClipboard(newKeyResult.key)}
                    className={`btn-secondary px-3 flex items-center gap-1.5 text-sm ${copiedKey ? 'text-green-700 border-green-300' : ''}`}
                  >
                    {copiedKey ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedKey ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end p-6 border-t border-slate-200">
              <button onClick={() => setNewKeyResult(null)} className="btn-primary text-sm">Done — I've saved the key</button>
            </div>
          </div>
        </div>
      )}

      {/* Org Detail Drawer */}
      {selectedOrg && (
        <OrgDetailDrawer
          org={selectedOrg}
          orgUsers={users.filter(u => u.org_id === selectedOrg.id)}
          currentUserId={profile?.id}
          isPlatformAdmin={isPlatformAdmin}
          roleColors={roleColors}
          onClose={() => setSelectedOrg(null)}
          onInvite={() => { setSelectedOrg(null); setShowInvite(true) }}
          onRoleChange={changeRole}
          onInvalidate={() => qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })}
        />
      )}

      {/* Modals */}
      {showInvite && (
        <InviteUserModal
          orgs={orgs}
          defaultOrgId={selectedOrg?.id || profile?.org_id}
          insurers={insurers}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showAddOrg && (
        <AddOrgModal onClose={() => setShowAddOrg(false)} />
      )}
      {/* 2FA enrollment modal */}
      {showEnroll && <TwoFAEnrollModal onClose={() => setShowEnroll(false)} onEnrolled={handleEnrolled} />}

      {assignModal && (
        <AssignUserModal
          org={assignModal}
          allUsers={users}
          onClose={() => setAssignModal(null)}
          onAssigned={() => {
            qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
            qc.invalidateQueries({ queryKey: ['admin-orgs'] })
          }}
        />
      )}
    </div>
  )
}
