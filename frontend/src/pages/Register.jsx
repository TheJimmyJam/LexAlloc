import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import toast from 'react-hot-toast'

export default function Register() {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm()
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const password = watch('password')

  const onSubmit = async ({ orgName, firstName, lastName, email, password }) => {
    // 1. Create auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr) { toast.error(authErr.message); return }

    const userId = authData.user.id

    // 2. Create organization
    const { data: org, error: orgErr } = await supabase
      .from('la_organizations')
      .insert({ name: orgName })
      .select()
      .single()
    if (orgErr) { toast.error(orgErr.message); return }

    // 3. Create profile (admin role for org creator)
    const { error: profileErr } = await supabase.from('la_profiles').insert({
      id: userId,
      org_id: org.id,
      role: 'admin',
      first_name: firstName,
      last_name: lastName,
    })
    if (profileErr) { toast.error(profileErr.message); return }

    toast.success('Account created! Check your email to confirm.')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/logo.svg" alt="LexAlloc" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create Your Organization</h1>
          <p className="text-slate-400 mt-1 text-sm">You'll be the admin for your organization.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl p-8 shadow-2xl space-y-5">
          <div>
            <label className="form-label">Organization / Firm Name</label>
            <input className="form-input" placeholder="Smith & Associates LLP"
              {...register('orgName', { required: 'Organization name is required' })} />
            {errors.orgName && <p className="text-red-500 text-xs mt-1">{errors.orgName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">First Name</label>
              <input className="form-input" placeholder="Jane"
                {...register('firstName', { required: 'Required' })} />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input className="form-input" placeholder="Doe"
                {...register('lastName', { required: 'Required' })} />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" placeholder="you@firm.com"
              {...register('email', { required: 'Email is required' })} />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} className="form-input pr-10" placeholder="Min. 8 characters"
                {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Min 8 characters' } })} />
              <button type="button" className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(p => !p)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="form-label">Confirm Password</label>
            <input type="password" className="form-input" placeholder="••••••••"
              {...register('confirmPassword', {
                required: 'Required',
                validate: v => v === password || 'Passwords do not match'
              })} />
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
          </div>

          <button type="submit" className="btn-primary w-full justify-center" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
