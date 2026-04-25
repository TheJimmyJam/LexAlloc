import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Shield, Users, Building2, Plus, X, Trash2, Mail, UserCheck, UserPlus, ArrowRightLeft, Database, Plug, CheckCircle2, AlertCircle, ExternalLink, Settings2, RefreshCcw, CreditCard, Zap, Star, Building, ChevronRight, Loader2, Key, Copy, Eye, EyeOff, Code, Terminal, Palette, Globe, Image } from 'lucide-react'
import { applyPalette } from '../context/BrandingContext.jsx'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'

const TABS = [
  { key: 'users',        label: 'Users',         icon: Users      },
  { key: 'orgs',         label: 'Organizations', icon: Building2  },
  { key: 'integrations', label: 'Integrations',  icon: Plug       },
  { key: 'billing',      label: 'Billing',        icon: CreditCard },
  { key: 'api',          label: 'API',            icon: Key        },
  { key: 'branding',     label: 'Branding',       icon: Palette    },
]

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

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { profile, refetchProfile } = useAuth()
  const [tab, setTab] = useState('users')

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
  // Optimistic insurer display — keyed by userId, cleared after refetch
  const [pendingInsurers, setPendingInsurers] = useState({})

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

  // ── Billing ───────────────────────────────────────────────────────────────
  const [billingInterval, setBillingInterval] = useState('monthly')
  const [seats,           setSeats]           = useState(1)
  const [billingLoading,  setBillingLoading]  = useState(null) // 'checkout' | 'portal'

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['billing-subscription', profile?.org_id],
    queryFn:  () => api.getSubscription(),
    enabled:  !!profile?.org_id && tab === 'billing',
    staleTime: 30_000,
  })

  // Sync seat count from existing subscription
  useEffect(() => {
    if (subscription?.seat_count) setSeats(subscription.seat_count)
  }, [subscription?.seat_count])

  const handleUpgrade = async (plan) => {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@lexalloc.com?subject=LexAlloc%20Enterprise%20Inquiry'
      return
    }
    setBillingLoading('checkout')
    try {
      const { url } = await api.createCheckoutSession({ plan, seats, interval: billingInterval })
      window.location.href = url
    } catch (err) {
      toast.error(err.message || 'Could not start checkout')
    } finally {
      setBillingLoading(null)
    }
  }

  const handleManageBilling = async () => {
    setBillingLoading('portal')
    try {
      const { url } = await api.createPortalSession()
      window.location.href = url
    } catch (err) {
      toast.error(err.message || 'Could not open billing portal')
    } finally {
      setBillingLoading(null)
    }
  }

  // ── API Keys ──────────────────────────────────────────────────────────────
  const [showCreateKey,    setShowCreateKey]    = useState(false)
  const [newKeyResult,     setNewKeyResult]     = useState(null)  // { key, name }
  const [newKeyName,       setNewKeyName]       = useState('')
  const [newKeyScopes,     setNewKeyScopes]     = useState(['read'])
  const [newKeyExpiry,     setNewKeyExpiry]     = useState('')
  const [creatingKey,      setCreatingKey]      = useState(false)
  const [copiedKey,        setCopiedKey]        = useState(false)

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

  const changeRole = async (userId, role) => {
    const { error } = await supabase.from('la_profiles').update({ role }).eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success('Role updated')
    qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
  }

  const changeOrg = async (userId, orgId) => {
    const { error } = await supabase
      .from('la_profiles')
      .update({ org_id: orgId, insurer_id: null })
      .eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success('Organization updated')
    qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
    qc.invalidateQueries({ queryKey: ['admin-orgs'] })
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

  const togglePlatformAdmin = async (userId, current) => {
    if (userId === profile?.id && current) {
      toast.error("Can't remove your own DB Admin status")
      return
    }
    const { error } = await supabase
      .from('la_profiles')
      .update({ is_platform_admin: !current })
      .eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success(current ? 'DB Admin revoked' : 'DB Admin granted')
    qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
    qc.invalidateQueries({ queryKey: ['platform-admins'] })
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
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

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
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Name</th>
                  <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Email</th>
                  {isPlatformAdmin && (
                    <th className="hidden md:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Organization</th>
                  )}
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Role</th>
                  <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer (clients)</th>
                  {isPlatformAdmin && (
                    <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">DB Admin</th>
                  )}
                  <th className="hidden md:table-cell text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
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
                    </td>
                    <td className="hidden sm:table-cell px-4 py-4">
                      {u.role === 'client' ? (
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
                          {insurersForOrg(u.org_id).map(ins => (
                            <option key={ins.id} value={ins.id}>{ins.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    {isPlatformAdmin && (
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
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toast('Remove user via Supabase dashboard for now.')}
                        disabled={u.id === profile?.id}
                        className="text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    <tr key={org.id} className="hover:bg-slate-50">
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
                        <td className="px-4 py-4">
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
      {tab === 'billing' && (() => {
        const PLANS = [
          {
            id: 'starter', name: 'Starter', icon: Zap, iconBg: 'bg-slate-100', iconColor: 'text-slate-600',
            tagline: 'For small teams getting started',
            price: { monthly: 0, annual: 0 }, unit: null,
            features: ['Up to 3 users', '10 active matters', 'Core apportionment methods', 'Community support'],
            cta: 'Current plan', ctaDisabled: true,
          },
          {
            id: 'professional', name: 'Professional', icon: Star, iconBg: 'bg-brand-100', iconColor: 'text-brand-600',
            tagline: 'For growing firms that need more',
            price: { monthly: 49, annual: 39 }, unit: '/seat/mo',
            badge: 'Most popular',
            features: ['Unlimited users & matters', 'All calculation methods', 'Custom % overrides', 'Audit log & 2FA', 'Policy limit alerts', 'Priority support'],
            cta: 'Upgrade to Professional',
          },
          {
            id: 'enterprise', name: 'Enterprise', icon: Building, iconBg: 'bg-purple-100', iconColor: 'text-purple-700',
            tagline: 'Custom pricing for large firms',
            price: { monthly: 'Custom', annual: 'Custom' }, unit: null,
            features: ['Everything in Professional', 'SSO / SAML', 'Dedicated CSM', 'Custom integrations', 'SLA guarantee'],
            cta: 'Contact Sales',
          },
        ]

        const currentPlan = subscription?.plan || 'starter'
        const subStatus   = subscription?.status || 'active'
        const periodEnd   = subscription?.period_end
        const hasStripe   = subscription?.has_subscription

        const statusColor = {
          active:     'bg-green-100 text-green-700',
          trialing:   'bg-brand-100 text-brand-700',
          past_due:   'bg-red-100 text-red-700',
          canceled:   'bg-slate-100 text-slate-500',
          unpaid:     'bg-red-100 text-red-700',
          incomplete: 'bg-amber-100 text-amber-700',
        }[subStatus] || 'bg-slate-100 text-slate-600'

        return (
          <div className="max-w-3xl space-y-6">
            {/* Current plan banner */}
            {subLoading ? (
              <div className="card p-6 flex items-center gap-3 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading subscription…
              </div>
            ) : (
              <div className="card p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-semibold text-slate-900 text-lg capitalize">{currentPlan} Plan</h2>
                      <span className={`badge text-xs font-semibold capitalize ${statusColor}`}>{subStatus.replace('_', ' ')}</span>
                    </div>
                    {periodEnd && (
                      <p className="text-sm text-slate-500">
                        {subStatus === 'canceled' ? 'Access ends' : 'Renews'}{' '}
                        {format(new Date(periodEnd), 'MMMM d, yyyy')}
                      </p>
                    )}
                    {currentPlan === 'professional' && (
                      <p className="text-sm text-slate-500 mt-0.5">
                        {subscription?.seat_count || 1} seat{(subscription?.seat_count || 1) !== 1 ? 's' : ''} · {subscription?.billing_interval === 'annual' ? 'Billed annually' : 'Billed monthly'}
                      </p>
                    )}
                  </div>
                  {hasStripe && (
                    <button
                      onClick={handleManageBilling}
                      disabled={billingLoading === 'portal'}
                      className="btn-secondary flex items-center gap-2 text-sm"
                    >
                      {billingLoading === 'portal'
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CreditCard className="h-4 w-4" />}
                      Manage Subscription
                    </button>
                  )}
                </div>
                {subStatus === 'past_due' && (
                  <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Payment failed. Update your payment method to avoid service interruption.
                    <button onClick={handleManageBilling} className="ml-auto font-medium underline">Fix now</button>
                  </div>
                )}
              </div>
            )}

            {/* Billing interval toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Billing:</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {['monthly', 'annual'].map(interval => (
                  <button
                    key={interval}
                    onClick={() => setBillingInterval(interval)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      billingInterval === interval
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {interval === 'monthly' ? 'Monthly' : 'Annual'}
                    {interval === 'annual' && <span className="ml-1.5 text-xs font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">Save 20%</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLANS.map(plan => {
                const Icon      = plan.icon
                const isCurrent = plan.id === currentPlan
                const price     = plan.price[billingInterval]

                return (
                  <div
                    key={plan.id}
                    className={`card p-5 flex flex-col relative ${
                      plan.id === 'professional' ? 'ring-2 ring-brand-400 shadow-lg' : ''
                    } ${isCurrent ? 'bg-slate-50' : ''}`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.iconBg} mb-4`}>
                      <Icon className={`h-5 w-5 ${plan.iconColor}`} />
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">{plan.name}</h3>
                    <p className="text-xs text-slate-500 mb-3">{plan.tagline}</p>

                    {/* Price */}
                    <div className="mb-4">
                      {typeof price === 'number' ? (
                        price === 0 ? (
                          <span className="text-3xl font-bold text-slate-800">Free</span>
                        ) : (
                          <div className="flex items-end gap-1">
                            <span className="text-3xl font-bold text-slate-800">${price}</span>
                            <span className="text-sm text-slate-500 mb-1">{plan.unit}</span>
                          </div>
                        )
                      ) : (
                        <span className="text-2xl font-bold text-slate-800">Custom</span>
                      )}
                    </div>

                    {/* Seat adjuster for Pro */}
                    {plan.id === 'professional' && !isCurrent && (
                      <div className="flex items-center gap-2 mb-4 p-2 bg-slate-50 rounded-lg">
                        <span className="text-xs text-slate-500">Seats:</span>
                        <button
                          onClick={() => setSeats(s => Math.max(1, s - 1))}
                          className="w-6 h-6 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold"
                        >−</button>
                        <span className="text-sm font-bold text-slate-800 w-6 text-center">{seats}</span>
                        <button
                          onClick={() => setSeats(s => s + 1)}
                          className="w-6 h-6 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold"
                        >+</button>
                        {typeof price === 'number' && price > 0 && (
                          <span className="text-xs text-brand-600 font-semibold ml-auto">
                            ${(price * seats * (billingInterval === 'annual' ? 12 : 1)).toLocaleString()}/{billingInterval === 'annual' ? 'yr' : 'mo'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Features */}
                    <ul className="space-y-1.5 mb-6 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => !isCurrent && handleUpgrade(plan.id)}
                      disabled={isCurrent || billingLoading === 'checkout'}
                      className={`w-full py-2 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                        isCurrent
                          ? 'bg-slate-100 text-slate-400 cursor-default'
                          : plan.id === 'professional'
                          ? 'bg-brand-600 hover:bg-brand-700 text-white'
                          : plan.id === 'enterprise'
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                      }`}
                    >
                      {billingLoading === 'checkout' && plan.id !== 'enterprise'
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : isCurrent
                        ? '✓ Current plan'
                        : <>{plan.cta} <ChevronRight className="h-4 w-4" /></>
                      }
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Setup note for developers */}
            <details className="card p-5 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700 flex items-center gap-2 select-none">
                <Settings2 className="h-4 w-4 text-slate-400" />
                Developer setup — Stripe environment variables
              </summary>
              <div className="mt-4 space-y-3 text-slate-600">
                <p className="font-medium text-slate-800">Railway backend (.env)</p>
                <ul className="space-y-1 font-mono text-xs bg-slate-50 rounded-lg p-3">
                  {['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_ANNUAL', 'APP_URL'].map(v => (
                    <li key={v} className="text-slate-700">{v}=<span className="text-slate-400">your_value_here</span></li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500">
                  Create products in the Stripe Dashboard → Products. Copy the Price IDs into the env vars above.
                  Set the webhook endpoint to <code className="bg-slate-100 px-1 rounded">{'{YOUR_RAILWAY_URL}'}/billing/webhook</code> and enable events:
                  checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, invoice.payment_succeeded.
                </p>
              </div>
            </details>
          </div>
        )
      })()}

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
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{k.key_prefix}••••••••••••••••</p>
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

      {/* Modals */}
      {showInvite && (
        <InviteUserModal
          orgs={orgs}
          defaultOrgId={profile?.org_id}
          insurers={insurers}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showAddOrg && (
        <AddOrgModal onClose={() => setShowAddOrg(false)} />
      )}
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
