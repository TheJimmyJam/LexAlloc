import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Info } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const [email, setEmail]       = useState('admin@lexalloc.demo')
  const [password, setPassword] = useState('demo1234')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email) { toast.error('Enter an email'); return }
    setLoading(true)
    setTimeout(() => {
      signIn(email)
      toast.success('Welcome to LexAlloc!')
      navigate('/dashboard')
      setLoading(false)
    }, 600)
  }

  const quickLogin = (e) => {
    setEmail(e)
    setTimeout(() => {
      signIn(e)
      toast.success('Signed in!')
      navigate('/dashboard')
    }, 300)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="LexAlloc" className="w-72 mx-auto" />
        </div>

        {/* Demo notice */}
        <div className="bg-brand-500/20 border border-brand-500/40 rounded-xl p-4 mb-5 flex gap-3">
          <Info className="h-4 w-4 text-brand-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-brand-200 text-sm font-medium">Demo Mode</p>
            <p className="text-brand-300 text-xs mt-0.5">Any email/password works. All data lives in your browser.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-2xl space-y-5">
          <div>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="any@email.com" />
          </div>
          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} className="form-input pr-10"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="anything works" />
              <button type="button" className="absolute right-3 top-2.5 text-slate-400" onClick={() => setShowPwd(p => !p)}>
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary w-full justify-center">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400 text-center mb-3">Quick access — sign in as:</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Admin',  email: 'admin@lexalloc.demo',  color: 'bg-brand-50 text-brand-700 border-brand-200' },
                { label: 'Client', email: 'client@lexalloc.demo', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                { label: 'User',   email: 'user@lexalloc.demo',   color: 'bg-slate-50 text-slate-700 border-slate-200' },
              ].map(({ label, email: e, color }) => (
                <button key={e} type="button" onClick={() => quickLogin(e)}
                  className={`text-xs font-medium py-2 px-3 rounded-lg border transition-colors ${color} hover:opacity-80`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
