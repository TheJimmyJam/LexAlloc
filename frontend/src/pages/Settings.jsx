import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabase.js'
import { User, Lock, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
  const { profile, refetchProfile } = useAuth()
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { isSubmitting: isPwdSubmitting } } = useForm()

  useEffect(() => {
    if (profile) reset({ first_name: profile.first_name, last_name: profile.last_name })
  }, [profile])

  const onSaveProfile = async (values) => {
    const { error } = await supabase.from('la_profiles').update({
      first_name: values.first_name,
      last_name:  values.last_name,
    }).eq('id', profile.id)
    if (error) { toast.error(error.message); return }
    toast.success('Profile updated!')
    refetchProfile()
  }

  const onChangePassword = async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { toast.error(error.message); return }
    toast.success('Password updated!')
    resetPwd()
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

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
            <label className="form-label">Email</label>
            <input className="form-input" value={profile?.email || ''} disabled />
          </div>
          <div>
            <label className="form-label">Role</label>
            <input className="form-input capitalize" value={profile?.role || ''} disabled />
          </div>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Organization */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 p-5 border-b border-slate-100">
          <Building2 className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-slate-900">Organization</h2>
        </div>
        <div className="p-5">
          <div>
            <label className="form-label">Organization Name</label>
            <input className="form-input" value={profile?.organizations?.name || ''} disabled />
          </div>
        </div>
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
