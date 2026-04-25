import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { User, Lock, Building2, Shield, ShieldCheck, ShieldOff, QrCode, Loader2, CheckCircle2, X } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_COLORS = {
  admin:  'bg-brand-100 text-brand-700',
  user:   'bg-slate-100 text-slate-600',
  client: 'bg-blue-100 text-blue-700',
}

// ── 2FA Enrollment Modal ──────────────────────────────────────────────────────
function TwoFAEnrollModal({ onClose, onEnrolled }) {
  const [step,        setStep]        = useState('loading') // loading | scan | confirm | done
  const [factorId,    setFactorId]    = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [qrCode,      setQrCode]      = useState(null)   // SVG data URI
  const [secret,      setSecret]      = useState(null)   // manual entry
  const [code,        setCode]        = useState('')
  const [verifying,   setVerifying]   = useState(false)
  const [showSecret,  setShowSecret]  = useState(false)

  useEffect(() => {
    async function startEnroll() {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) { toast.error('Could not start 2FA setup: ' + error.message); onClose(); return }
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)   // SVG URI
      setSecret(data.totp.secret)
      setStep('scan')
    }
    startEnroll()
  }, [])

  const handleConfirm = async (e) => {
    e?.preventDefault()
    if (code.length < 6 || !factorId) return
    setVerifying(true)
    try {
      // Challenge then verify to confirm enrollment
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr) { toast.error(cErr.message); return }
      setChallengeId(challenge.id)

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (vErr) {
        toast.error('Incorrect code — try again')
        setCode('')
        return
      }
      setStep('done')
      onEnrolled()
    } finally {
      setVerifying(false)
    }
  }

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    if (val.length === 6) setTimeout(() => handleConfirm(), 50)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-lg">Set Up Two-Factor Authentication</h2>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="p-6">
          {step === 'loading' && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          )}

          {step === 'scan' && (
            <div className="space-y-5">
              {/* Step 1: Scan */}
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="font-medium text-brand-900 text-sm">Scan the QR code</p>
                  <p className="text-xs text-brand-700 mt-0.5">Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and scan the code below.</p>
                </div>
              </div>

              {/* QR Code */}
              {qrCode && (
                <div className="flex justify-center p-4 bg-white border-2 border-slate-200 rounded-xl">
                  <img src={qrCode} alt="2FA QR Code" className="w-44 h-44" />
                </div>
              )}

              {/* Manual entry */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  className="text-xs text-brand-600 hover:text-brand-700 underline"
                >
                  {showSecret ? 'Hide' : "Can't scan? Enter code manually"}
                </button>
                {showSecret && secret && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Manual entry key (copy into your app):</p>
                    <code className="text-sm font-mono font-bold text-slate-800 break-all select-all">{secret}</code>
                  </div>
                )}
              </div>

              <button onClick={() => setStep('confirm')} className="btn-primary w-full justify-center">
                I've scanned the code →
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="font-medium text-brand-900 text-sm">Enter the 6-digit code</p>
                  <p className="text-xs text-brand-700 mt-0.5">Enter the code shown in your authenticator app to confirm setup.</p>
                </div>
              </div>

              <div>
                <label className="form-label text-center block">Authentication Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  value={code}
                  onChange={handleCodeChange}
                  maxLength={6}
                  className="form-input text-center text-2xl font-mono tracking-[0.5em]"
                  disabled={verifying}
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('scan')} className="btn-secondary flex-1 justify-center">← Back</button>
                <button
                  type="submit"
                  disabled={verifying || code.length < 6}
                  className="btn-primary flex-1 justify-center"
                >
                  {verifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</> : 'Confirm & Enable'}
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-lg">2FA Enabled!</h3>
                <p className="text-sm text-slate-500 mt-1">Your account is now protected with two-factor authentication. You'll be asked for a code each time you log in.</p>
              </div>
              <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const { profile, refetchProfile, hasTOTP, refreshMfaLevel } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { isSubmitting: isPwdSubmitting } } = useForm()
  const { register: regOrg, handleSubmit: handleOrgSubmit, reset: resetOrg, formState: { isSubmitting: isOrgSubmitting } } = useForm()

  const [showEnroll,   setShowEnroll]   = useState(false)
  const [disabling2FA, setDisabling2FA] = useState(false)

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
    const updates = { first_name: values.first_name, last_name: values.last_name }
    if (isAdmin) updates.role = values.role
    const { error } = await supabase.from('la_profiles').update(updates).eq('id', profile.id)
    if (error) { toast.error(error.message); return }
    if (isAdmin && values.email !== profile.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: values.email })
      if (emailErr) toast.error('Profile saved but email update failed: ' + emailErr.message)
      else toast.success('Profile updated! Check your new email for a confirmation link.')
      refetchProfile(); return
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
      .from('la_organizations').update({ name: values.org_name }).eq('id', profile.org_id)
    if (error) { toast.error(error.message); return }
    toast.success('Organization name updated!')
    refetchProfile()
  }

  const handleDisable2FA = async () => {
    if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return
    setDisabling2FA(true)
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr || !factors?.totp?.length) { toast.error('No 2FA factor found.'); return }
      const factorId = factors.totp[0].id
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) { toast.error('Failed to disable 2FA: ' + error.message); return }
      await refreshMfaLevel()
      toast.success('Two-factor authentication disabled.')
    } finally {
      setDisabling2FA(false)
    }
  }

  const handleEnrolled = async () => {
    await refreshMfaLevel()
    setShowEnroll(false)
    toast.success('Two-factor authentication is now active.')
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

      {/* Two-Factor Authentication */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 p-5 border-b border-slate-100">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-slate-900">Two-Factor Authentication</h2>
          {hasTOTP && (
            <span className="ml-auto badge bg-green-100 text-green-700 text-xs">
              <CheckCircle2 className="h-3 w-3 inline mr-0.5" /> Enabled
            </span>
          )}
        </div>

        <div className="p-5">
          {hasTOTP ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800 text-sm">2FA is active on your account</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    You'll be prompted for an authentication code each time you sign in. Use Google Authenticator, Authy, 1Password, or any TOTP-compatible app.
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisable2FA}
                disabled={disabling2FA}
                className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200"
              >
                {disabling2FA
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Disabling…</>
                  : <><ShieldOff className="h-4 w-4" /> Disable Two-Factor Authentication</>}
              </button>
              <p className="text-xs text-slate-400">
                Disabling 2FA reduces account security. Admins may require 2FA for compliance purposes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 text-sm">2FA is not enabled</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Two-factor authentication adds a second layer of security. Required for many insurance industry compliance programs.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowEnroll(true)} className="btn-primary">
                <QrCode className="h-4 w-4" /> Enable Two-Factor Authentication
              </button>
              <p className="text-xs text-slate-400">
                You'll need an authenticator app like Google Authenticator, Authy, or 1Password to complete setup.
              </p>
            </div>
          )}
        </div>
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

      {/* Enrollment modal */}
      {showEnroll && (
        <TwoFAEnrollModal
          onClose={() => setShowEnroll(false)}
          onEnrolled={handleEnrolled}
        />
      )}
    </div>
  )
}
