import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle2, Lock, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useBranding } from '../context/BrandingContext.jsx'
import toast from 'react-hot-toast'

export default function SetPassword() {
  const navigate = useNavigate()
  const { brandName, logoUrl } = useBranding()
  const appName = brandName || 'LexAlloc'
  const logoSrc = logoUrl  || '/logo-icon.png'

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [done,        setDone]        = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [linkExpired,  setLinkExpired]  = useState(false)

  // Supabase embeds the invite tokens in the URL hash.
  // The JS client picks them up automatically via onAuthStateChange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        setSessionReady(true)
      }
    })

    // Also check if a session already exists (handles page reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    // If no session after 6 seconds, the link is expired or already used
    const timeout = setTimeout(() => {
      setLinkExpired(prev => {
        // Only expire if session still not ready
        if (!sessionReady) return true
        return prev
      })
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      // Sign out so they have to authenticate with their new credentials
      await supabase.auth.signOut()
      setDone(true)
    } catch (err) {
      toast.error(err.message || 'Failed to set password')
    } finally {
      setSubmitting(false)
    }
  }

  if (linkExpired && !sessionReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="h-7 w-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Invitation link expired</h2>
            <p className="text-slate-500 text-sm">
              This invite link has already been used or has expired. Please ask your administrator to send a new invitation.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full justify-center mt-2"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Password set!</h2>
            <p className="text-slate-500 text-sm">
              Your account is ready. Sign in with your email and new password to get started.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full justify-center mt-2"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src={logoSrc} alt={appName} className="rounded-full" style={{ width: '72px', height: '72px', objectFit: 'cover' }} />
          </div>
          <h1 className="text-2xl font-bold text-white">Set your password</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Create a password to activate your {appName} account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-2xl space-y-5">
          {!sessionReady && (
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-600 flex-shrink-0" />
              Verifying your invitation link…
            </div>
          )}

          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="At least 8 characters"
                className="form-input pr-10"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={!sessionReady}
              />
              <button type="button"
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your password"
                className="form-input pr-10"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
                disabled={!sessionReady}
              />
              <button type="button"
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                onClick={() => setShowConfirm(p => !p)}>
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !sessionReady}
            className="btn-primary w-full justify-center flex items-center gap-2"
          >
            {submitting
              ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Setting password…</>
              : <><Lock className="h-4 w-4" /> Set Password &amp; Continue</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
