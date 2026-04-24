import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Scale, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import toast from 'react-hot-toast'

export default function ForgotPassword() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()
  const [sent, setSent] = useState(false)

  const onSubmit = async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/settings?reset=true`,
    })
    if (error) { toast.error(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-2xl mb-4">
            <Scale className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {sent ? (
            <div className="text-center">
              <p className="text-slate-700 mb-4">Check your email for a reset link.</p>
              <Link to="/login" className="btn-primary">Back to Sign In</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="form-label">Email</label>
                <input type="email" className="form-input" placeholder="you@firm.com"
                  {...register('email', { required: 'Email is required' })} />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <button type="submit" className="btn-primary w-full justify-center" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send Reset Link'}
              </button>
              <Link to="/login" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 justify-center">
                <ArrowLeft className="h-3 w-3" /> Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
