import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Info, Zap } from 'lucide-react'
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
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between p-12">
        <div>
          <img src="/logo.svg" alt="LexAlloc" className="w-64" />
        </div>
        <div>
          <blockquote className="text-slate-300 text-lg font-light leading-relaxed">
            "Accurate apportionment, every invoice. Built for the complexity of multi-party litigation."
          </blockquote>
          <div className="mt-6 flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-semibold">LA</div>
            <div>
              <p className="text-slate-200 text-sm font-medium">LexAlloc Platform</p>
              <p className="text-slate-500 text-xs">Legal Invoice Apportionment</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <div className="w-2 h-2 rounded-full bg-amber-500" />
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <img src="/logo.svg" alt="LexAlloc" className="w-48" />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
            <p className="text-slate-500 text-sm mt-1">Access your LexAlloc workspace</p>
          </div>

          {/* Demo notice */}
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-3.5 mb-6 flex gap-3">
            <Info className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-brand-800 text-sm font-medium">Demo Mode</p>
              <p className="text-brand-600 text-xs mt-0.5">Any email/password works. All data lives in your browser.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="form-input pr-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => setShowPwd(p => !p)}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Quick login */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 font-medium mb-3 flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Quick access — sign in as:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Admin',  email: 'admin@lexalloc.demo',  cls: 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100' },
                { label: 'Client', email: 'client@lexalloc.demo', cls: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
                { label: 'User',   email: 'user@lexalloc.demo',   cls: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100' },
              ].map(({ label, email: e, cls }) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => quickLogin(e)}
                  className={`text-xs font-semibold py-2 px-3 rounded-lg border transition-colors ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
