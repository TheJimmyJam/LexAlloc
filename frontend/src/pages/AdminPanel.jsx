import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Shield, Users, Building2, Plus, X, Trash2, Mail, UserCheck, Link2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'

const TABS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'orgs',  label: 'Organizations', icon: Building2 },
]

function InviteUserModal({ onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { role: 'user' }
  })

  const onSubmit = async (values) => {
    try {
      await api.inviteUser(values.email, values.role, profile.org_id)
      setSentEmail(values.email)
      setSent(true)
      qc.invalidateQueries({ queryKey: ['admin-users', profile.org_id] })
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
              An invitation email has been sent to <strong>{sentEmail}</strong>. They'll receive a link to set their password and join your organization.
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
          <p className="text-sm text-slate-500">
            They'll receive an email with a link to set their password and join <strong>{profile?.la_organizations?.name}</strong>.
          </p>
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

export default function AdminPanel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')
  const [showInvite, setShowInvite] = useState(false)

  const qc = useQueryClient()

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_profiles')
        .select('*, la_organizations(name), la_insurers(name)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: insurers = [] } = useQuery({
    queryKey: ['admin-insurers', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurers')
        .select('id, name')
        .eq('org_id', profile.org_id)
        .order('name')
      return data || []
    }
  })

  const { data: orgs = [] } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_organizations')
        .select('*, la_profiles(count)')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const roleColors = {
    admin: 'bg-brand-100 text-brand-700',
    client: 'bg-blue-100 text-blue-700',
    user: 'bg-slate-100 text-slate-600',
  }

  const changeRole = async (userId, role) => {
    const { error } = await supabase.from('la_profiles').update({ role }).eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success('Role updated')
    qc.invalidateQueries({ queryKey: ['admin-users', profile?.org_id] })
  }

  const assignInsurer = async (userId, insurer_id) => {
    const { error } = await supabase
      .from('la_profiles')
      .update({ insurer_id: insurer_id || null })
      .eq('id', userId)
    if (error) { toast.error(error.message); return }
    toast.success('Insurer assigned')
    qc.invalidateQueries({ queryKey: ['admin-users', profile?.org_id] })
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center">
          <Shield className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-500 text-sm">Manage users and organizations</p>
        </div>
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

      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{users.length} user{users.length !== 1 ? 's' : ''} in your org</p>
            <button onClick={() => setShowInvite(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Invite User
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer (clients)</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Joined</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {u.first_name} {u.last_name}
                      {u.id === profile?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">{u.email}</td>
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
                          {insurers.map(ins => (
                            <option key={ins.id} value={ins.id}>{ins.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-400">
                      {u.created_at ? format(parseISO(u.created_at), 'MM/dd/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toast('User management coming soon — configure via Supabase dashboard.')}
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

      {tab === 'orgs' && (
        <div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Organization</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Users</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgs.map(org => (
                  <tr key={org.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {org.name}
                      {org.id === profile?.org_id && <span className="ml-2 text-xs text-brand-600 font-semibold">(your org)</span>}
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-slate-600">
                      {org.la_profiles?.[0]?.count ?? 0}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-400">
                      {org.created_at ? format(parseISO(org.created_at), 'MM/dd/yyyy') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
