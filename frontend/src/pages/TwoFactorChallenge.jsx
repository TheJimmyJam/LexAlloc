import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { ShieldCheck, Loader2, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TwoFactorChallenge() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const { signOut, refreshMfaLevel, profile } = useAuth()

  const [code,        setCode]        = useState('')
  const [verifying,   setVerifying]   = useState(false)
  const [factorId,    setFactorId]    = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [loadError,   setLoadError]   = useState(null)
  const inputRef = useRef(null)

  // On mount: list TOTP factors and issue a challenge immediately
  useEffect(() => {
    async function initChallenge() {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr || !factors?.totp?.length) {
        setLoadError('No 2FA factor found. Please re-enable 2FA in Settings.')
        return
      }

      const factor = factors.totp.find(f => f.status === 'verified') ?? factors.totp[0]
      setFactorId(factor.id)

      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (cErr) { setLoadError(cErr.message); return }
      setChallengeId(challenge.id)

      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 100)
    }
    initChallenge()
  }, [])

  const handleVerify = async (e) => {
    e?.preventDefault()
    if (code.length < 6 || !factorId || !challengeId) return

    setVerifying(true)
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      })

      if (error) {
        toast.error('Invalid code. Check your authenticator app and try again.')
        setCode('')
        // Re-issue a fresh challenge so the next attempt works
        const { data: newChallenge } = await supabase.auth.mfa.challenge({ factorId })
        if (newChallenge) setChallengeId(newChallenge.id)
        inputRef.current?.focus()
        return
      }

      await refreshMfaLevel()
      toast.success('Verified!')
      // Redirect to where user was headed, or dashboard
      const from = location.state?.from ?? '/dashboard'
      navigate(from, { replace: true })
    } finally {
      setVerifying(false)
    }
  }

  // Allow pasting 6-digit code and auto-submitting
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    if (val.length === 6) {
      // Small delay so state updates before submit
      setTimeout(() => handleVerify(), 50)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/logo.svg" alt="LexAlloc" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white">Two-Factor Authentication</h1>
          <p className="text-slate-400 mt-1 text-sm">Enter the code from your authenticator app</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">

          {loadError ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="h-6 w-6 text-red-500" />
              </div>
              <p className="text-sm text-red-600 mb-4">{loadError}</p>
              <button onClick={handleSignOut} className="btn-secondary w-full justify-center">
                <LogOut className="h-4 w-4" /> Sign out and try again
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="h-7 w-7 text-brand-600" />
                </div>
                {profile && (
                  <p className="text-sm text-slate-500">
                    Signing in as <span className="font-medium text-slate-700">{profile.email}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="form-label text-center block">Authentication Code</label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={handleChange}
                  maxLength={6}
                  className="form-input text-center text-2xl font-mono tracking-[0.5em] letter-spacing-wide"
                  disabled={verifying || !challengeId}
                />
                <p className="text-xs text-slate-400 text-center mt-1.5">
                  Open your authenticator app to get the 6-digit code
                </p>
              </div>

              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={verifying || code.length < 6 || !challengeId}
              >
                {verifying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" /> Verify</>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Sign out and use a different account
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center mt-4 text-xs text-slate-500">
          Using Google Authenticator, Authy, or 1Password? Open the app and find the LexAlloc entry.
        </p>
      </div>
    </div>
  )
}
