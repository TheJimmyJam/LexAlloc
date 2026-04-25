import { Link } from 'react-router-dom'
import {
  Users, Shield, ArrowRight, Upload, Cpu,
  BarChart3, Building2, Clock, Lock, ChevronRight,
  CheckCircle,
} from 'lucide-react'

const features = [
  {
    icon: Upload,
    color: 'bg-blue-500/20 text-blue-400',
    title: 'AI Invoice Parsing',
    desc: 'Drop in a PDF. AI extracts every line item, timekeeper, and billing period — ready to review in seconds.',
  },
  {
    icon: Users,
    color: 'bg-purple-500/20 text-purple-400',
    title: 'Multi-Party Apportionment',
    desc: 'Define parties and service dates. Every dollar is allocated pro-rata to whoever was responsible for that period.',
  },
  {
    icon: Clock,
    color: 'bg-amber-500/20 text-amber-400',
    title: 'Time-on-Risk Math',
    desc: 'Day-exact insurer obligations across overlapping and sequential policy periods — no spreadsheet required.',
  },
  {
    icon: Building2,
    color: 'bg-green-500/20 text-green-400',
    title: 'Insurer Breakdowns',
    desc: 'Per-insurer reports with policy overlaps, days-on-risk, claim numbers, and dollar obligations.',
  },
  {
    icon: Shield,
    color: 'bg-rose-500/20 text-rose-400',
    title: 'Insurer Portal',
    desc: 'Carrier reps get their own login — obligations, payment status, and balances across all their matters.',
  },
  {
    icon: BarChart3,
    color: 'bg-cyan-500/20 text-cyan-400',
    title: 'Audit-Ready Reports',
    desc: 'Defensible, itemized exports for carriers, mediations, and litigation. Clean output every time.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Create a Matter',
    desc: 'Add parties with service dates and insurers with policy periods.',
  },
  {
    num: '02',
    title: 'Upload Invoices',
    desc: 'AI reads the PDF and extracts everything. Review and confirm in under a minute.',
  },
  {
    num: '03',
    title: 'Run Apportionment',
    desc: 'One click calculates each party and insurer\'s obligation with a full audit trail.',
  },
  {
    num: '04',
    title: 'Demand & Track',
    desc: 'Generate per-insurer demands. Track payments in real time through the insurer portal.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 lg:px-16 py-4 bg-slate-950/90 backdrop-blur border-b border-white/5">
        <img src="/logo-icon.png" alt="LexAlloc" className="rounded-full" style={{ width: '44px', height: '44px', objectFit: 'cover' }} />
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-slate-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5">
            Log In
          </Link>
          <Link to="/register" className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors">
            Sign Up <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-16 pt-24 pb-28 text-center overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-600/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <div className="flex justify-center mb-10">
            <img src="/logo.svg" alt="LexAlloc" className="h-28 lg:h-36 w-auto" />
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold leading-tight mb-6 tracking-tight">
            Apportion Legal Fees<br />
            <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
              With Surgical Precision
            </span>
          </h1>
          <p className="text-slate-300 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            AI invoice parsing, day-exact time-on-risk math, and insurer-ready demand letters — built for coverage counsel and multi-insurer matters.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register"
              className="flex items-center gap-2 px-7 py-3.5 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:-translate-y-0.5">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login"
              className="flex items-center gap-2 px-7 py-3.5 bg-white/8 hover:bg-white/15 text-white font-medium rounded-xl border border-white/15 transition-all">
              Log In
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white">Invoice to demand in four steps</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(({ num, title, desc }) => (
            <div key={num} className="bg-white/4 hover:bg-white/7 border border-white/8 rounded-2xl p-6 transition-colors group">
              <div className="text-5xl font-black text-white/8 group-hover:text-white/12 transition-colors mb-4 leading-none">{num}</div>
              <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-20 bg-white/2 border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-white">Everything the apportionment workflow needs</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="bg-white/4 hover:bg-white/8 border border-white/8 rounded-2xl p-6 transition-all hover:-translate-y-0.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Spotlight ────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-brand-900/60 to-slate-900 border border-brand-500/20 p-10 lg:p-16 overflow-hidden relative">
          <div className="absolute right-0 top-0 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500/15 border border-brand-500/25 rounded-full text-brand-300 text-xs font-medium mb-5">
                <Cpu className="h-3 w-3" /> AI-Powered
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                30 seconds, not 30 minutes
              </h2>
              <p className="text-slate-300 leading-relaxed mb-6">
                Upload any law firm invoice as a PDF and LexAlloc's AI reads it — invoice number, dates, every line item with timekeeper, hours, rate, and amount. Review, correct, and save.
              </p>
              <ul className="space-y-3">
                {[
                  'Works with any PDF invoice format',
                  'All line items extracted automatically',
                  'Review and edit before saving',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-brand-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-950/60 rounded-2xl border border-white/10 p-6 font-mono text-xs space-y-2">
              <p className="text-slate-500">// AI extracted from invoice PDF</p>
              <p className="text-slate-300"><span className="text-brand-400">invoice_number</span>: <span className="text-green-400">"INV-2024-0847"</span></p>
              <p className="text-slate-300"><span className="text-brand-400">billing_firm</span>: <span className="text-green-400">"Hensley &amp; Partners LLP"</span></p>
              <p className="text-slate-300"><span className="text-brand-400">total_amount</span>: <span className="text-amber-400">48250.00</span></p>
              <p className="text-slate-500 mt-3">// line_items (34 extracted)</p>
              <p className="text-slate-300"><span className="text-purple-400">timekeeper</span>: <span className="text-green-400">"J. Cannon"</span> · <span className="text-amber-400">6.5h</span> @ <span className="text-amber-400">$495/hr</span></p>
              <p className="text-slate-300"><span className="text-purple-400">description</span>: <span className="text-green-400">"Review coverage position..."</span></p>
              <p className="text-slate-500">…</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-20 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to simplify apportionment?
          </h2>
          <p className="text-slate-400 text-lg mb-8">
            Set up your org in minutes. Upload your first invoice and see results immediately.
          </p>
          <Link to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:-translate-y-0.5 text-lg">
            Create Your Account <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-6 lg:px-16 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src="/logo-icon.png" alt="LexAlloc" className="rounded-full" style={{ width: '36px', height: '36px', objectFit: 'cover' }} />
          <p className="text-slate-500 text-sm">© {new Date().getFullYear()} LexAlloc. Built for legal professionals.</p>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/privacy" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-slate-400 hover:text-white transition-colors">Terms</Link>
            <Link to="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
            <Link to="/register" className="text-slate-400 hover:text-white transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
