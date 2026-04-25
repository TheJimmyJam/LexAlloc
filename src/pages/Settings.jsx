import { useAuth } from '../hooks/useAuth.jsx'
import { useForm } from 'react-hook-form'
import { db } from '../lib/mockDb.js'
import { User, Building2, Lock, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
  const { profile, updateProfile } = useAuth()
  const { register, handleSubmit } = useForm({ defaultValues: { first_name: profile?.first_name, last_name: profile?.last_name } })

  const onSave = (v) => {
    updateProfile({ first_name: v.first_name, last_name: v.last_name })
    toast.success('Profile updated!')
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Settings</h1>

      <div className="card mb-6">
        <div className="flex items-center gap-2 p-5 border-b border-slate-100"><User className="h-4 w-4 text-brand-600"/><h2 className="font-semibold text-slate-900">Profile</h2></div>
        <form onSubmit={handleSubmit(onSave)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="form-label">First Name</label><input className="form-input" {...register('first_name')}/></div>
            <div><label className="form-label">Last Name</label><input className="form-input" {...register('last_name')}/></div>
          </div>
          <div><label className="form-label">Email</label><input className="form-input" value={profile?.email||''} disabled/></div>
          <div><label className="form-label">Role</label><input className="form-input capitalize" value={profile?.role||''} disabled/></div>
          <button type="submit" className="btn-primary">Save Changes</button>
        </form>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 p-5 border-b border-slate-100"><Building2 className="h-4 w-4 text-brand-600"/><h2 className="font-semibold text-slate-900">Organization</h2></div>
        <div className="p-5"><div><label className="form-label">Organization Name</label><input className="form-input" value={profile?.organizations?.name||''} disabled/></div></div>
      </div>

      <div className="card border-red-100">
        <div className="flex items-center gap-2 p-5 border-b border-red-100"><RotateCcw className="h-4 w-4 text-red-500"/><h2 className="font-semibold text-slate-900">Reset Demo Data</h2></div>
        <div className="p-5">
          <p className="text-sm text-slate-500 mb-4">Resets all data back to the original demo seed data. Useful if you've made changes and want a fresh start.</p>
          <button onClick={() => { if(confirm('Reset all demo data to defaults?')) db.reset() }} className="btn-danger">Reset to Demo Defaults</button>
        </div>
      </div>
    </div>
  )
}
