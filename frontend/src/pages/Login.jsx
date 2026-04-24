import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import toast from 'react-hot-toast'

export default function Login() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const onSubmit = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { toast.error(error.message); return }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/logo.svg" alt="LexAlloc" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in to LexAlloc</h1>
          <p className="text-slate-400 mt-1 text-sm">Legal invoice apportionment, simplified.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl p-8 shadow-2xl space-y-5">
          <div>
            <label className="form-label">Email</label>
            <input
              type="email" placeholder="you@firm.com"
              className="form-input"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="form-input pr-10"
                {...register('password', { required: 'Password is required' })}
              />
              <button type="button" className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(p => !p)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-brand-600 hover:text-brand-700 text-xs">Forgot password?</Link>
          </div>

          <button type="submit" className="btn-primary w-full justify-center" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium">Create one</Link>
          </p>
        </form>
        <p className="text-center mt-4">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
