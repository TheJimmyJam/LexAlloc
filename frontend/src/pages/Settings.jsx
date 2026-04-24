import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { User, Lock, Building2, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_COLORS = {
  admin:  'bg-brand-100 text-brand-700',
  user:   'bg-slate-100 text-slate-600',
  client: 'bg-blue-100 text-blue-700',
}

export default function Settings() {
  const { profile, refetchProfile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { isSubmitting: isPwdSubmitting } } = useForm()
  const { register: regOrg, handleSubmit: handleOrgSubmit, reset: resetOrg, formState: { isSubmitting: isOrgSubmitting } } = useForm()

  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name,
        last_name:  profile.last_name,
        email:      profile.email,
        role:       profile.role,
      })
      resetOrg({ org_name: profile.la_organizations?.name || '' })
    }
  }, [profile])

  const onSaveProfile = async (values) => {
    // Update name (all roles)
    const updates = {
      first_name: values.first_name,
      last_name:  values.last_name,
    }
    // Admins can also update role
    if (isAdmin) updates.role = values.role

    const { error } = await supabase.from('la_profiles').update(updates).eq('id', profile.id)
    if (error) { toast.error(error.message); return }

    // Admins can update email via Auth
    if (isAdmin && values.email !== profile.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: values.email })
      if (emailErr) { toast.error('Profile saved but email update failed: ' + emailErr.message); }
      else toast.success('Profile updated! Check your new email for a confirmation link.')
      refetchProfile()
      return
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

  const onSaveOrg = async (values) => {
    const { error } = await supabase
      .from('la_organizations')
      .update({ name: values.org_name })
      .eq('id', profile.org_id)
    if (error) { toast.error(error.message); return }
    toast.success('Organization name updated!')
    refetchProfile()
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        {profile?.role && (
          <span className={`badge text-xs font-semibold px-2.5 py-1 capitalize ${ROLE_COLORS[profile.role] || 'bg-slate-100 text-slate-500'}`}>
            <Shield className="h-3 w-3 inline mr-1" />{profile.role}
          </span>
        )}
      </div>

      {/* Profile */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 p-5 border-b border-slate-100">
          <User className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-slate-900">Profile</h2>
        </div>
        <form onSubmit={handleSubmit(onSaveProfile)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">First Name</label>
              <input className="form-input" {...register('first_name')} />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input className="form-input" {...register('last_name')} />
            </div>
          </div>

          <div>
            <label className="form-label">
              Email {isAdmin && <span className="text-brand-600 text-xs ml-1">(admin editable)</span>}
            </label>
            {isAdmin ? (
              <input className="form-input" type="email" {...register('email')} />
            ) : (
              <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed" value={profile?.email || ''} disabled />
            )}
            {isAdmin && (
              <p className="text-xs text-slate-400 mt-1">Changing email sends a confirmation link to the new address.</p>
            )}
          </div>

          <div>
            <label className="form-label">
              Role {isAdmin && <span className="text-brand-600 text-xs ml-1">(admin editable)</span>}
            </label>
            {isAdmin ? (
              <select className="form-input" {...register('role')}>
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="client">Client</option>
              </select>
            ) : (
              <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed capitalize" value={profile?.role || ''} disabled />
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Organization — admin only */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 p-5 border-b border-slate-100">
          <Building2 className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-slate-900">Organization</h2>
        </div>
        {isAdmin ? (
          <form onSubmit={handleOrgSubmit(onSaveOrg)} className="p-5 space-y-4">
            <div>
              <label className="form-label">
                Organization Name <span className="text-brand-600 text-xs ml-1">(admin editable)</span>
              </label>
              <input className="form-input" {...regOrg('org_name', { required: true })} />
            </div>
            <button type="submit" className="btn-primary" disabled={isOrgSubmitting}>
              {isOrgSubmitting ? 'Saving…' : 'Save Organization'}
            </button>
          </form>
        ) : (
          <div className="p-5">
            <label className="form-label">Organization Name</label>
            <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed" value={profile?.la_organizations?.name || ''} disabled />
          </div>
        )}
      </div>

      {/* Change Password */}
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
  )
}
