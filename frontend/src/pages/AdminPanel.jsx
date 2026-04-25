import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Shield, Users, Building2, Plus, X, Trash2, Mail, UserCheck, UserPlus, ArrowRightLeft, Database, Plug, CheckCircle2, AlertCircle, ExternalLink, Settings2, RefreshCcw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'

const TABS = [
  { key: 'users',        label: 'Users',         icon: Users    },
  { key: 'orgs',         label: 'Organizations', icon: Building2 },
  { key: 'integrations', label: 'Integrations',  icon: Plug     },
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

// ─── Invite User Modal ────────────────────────────────────────────────────────

function InviteUserModal({ onClose, orgs, defaultOrgId }) {
  const qc = useQueryClient()
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { role: 'user', org_id: defaultOrgId || '' }
  })

  const onSubmit = async (values) => {
    try {
      await api.inviteUser(values.email, values.role, values.org_id)
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
            <select className="form-input" {...register('org_id', { required: true })}>
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
            <select className="form-input" {...register('role')}>
              <option value="user">User — standard access</option>
              <option value="client">Client — view only</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
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

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { profile, refetchProfile } = useAuth()
  const [tab, setTab] = useState('users')

  // Handle OAuth redirect back (?connected=quickbooks / ?error=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error     = params.get('error')
    if (connected) {
      setTab('integrations')
      toast.success(`${connected === 'quickbooks' ? 'QuickBooks' : 'Clio'} connected!`)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      setTab('integrations')
      toast.error(`Connection failed: ${error}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])
  const [showInvite,  setShowInvite]  = useState(false)
  const [showAddOrg,  setShowAddOrg]  = useState(false)
  const [assignModal, setAssignModal] = useState(null)

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
    const { error } = await supabase
      .from('la_profiles')
      .update({ insurer_id: insurer_id || null })
      .eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success('Insurer assigned')
    qc.invalidateQueries({ queryKey: ['admin-users', isPlatformAdmin ? 'all' : profile?.org_id] })
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
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Email</th>
                  {isPlatformAdmin && (
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Organization</th>
                  )}
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer (clients)</th>
                  {isPlatformAdmin && (
                    <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">DB Admin</th>
                  )}
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Joined</th>
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
                    <td className="px-4 py-4 text-sm text-slate-500">{u.email}</td>
                    {isPlatformAdmin && (
                      <td className="px-4 py-4">
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
                    <td className="px-4 py-4">
                      {u.role === 'client' ? (
                        <select
                          value={u.insurer_id || ''}
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
                    <td className="px-4 py-4 text-sm text-slate-400">
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
                </ol>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Modals */}
      {showInvite && (
        <InviteUserModal
          orgs={orgs}
          defaultOrgId={profile?.org_id}
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
