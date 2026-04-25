import { Link } from 'react-router-dom'
import {
  FileText, Users, PieChart, Shield, CheckCircle, ArrowRight, Scale,
  Zap, MailOpen, CreditCard, Lock, FileCheck, Building2, Sparkles,
  BarChart3, Bell, Upload, BookOpen, ChevronRight
} from 'lucide-react'

const coreFeatures = [
  {
    icon: Zap,
    title: 'AI Invoice Parsing',
    desc: 'Upload a PDF and LexAlloc\'s AI extracts every field automatically — invoice number, billing firm, timekeepers, line items, hours, and amounts. 30 seconds instead of 20 minutes.',
    color: 'from-amber-400 to-orange-500',
  },
  {
    icon: PieChart,
    title: 'Three Apportionment Methods',
    desc: 'Pro-rata time-on-risk (day-exact), equal shares, and limits-proportional — all selectable per invoice. Run all three side-by-side and choose the most defensible method.',
    color: 'from-brand-400 to-brand-600',
  },
  {
    icon: Users,
    title: 'Multi-Party & Multi-Insurer',
    desc: 'Any number of parties with custom share percentages. Each party carries its own insurer stack with separate policy periods, limits, and deductibles.',
    color: 'from-violet-400 to-violet-600',
  },
  {
    icon: MailOpen,
    title: 'One-Click Demand Letters',
    desc: 'Generate attorney-ready Word demand letters from any apportionment result. Methodology explanation, invoice summary table, obligation breakdown, and payment instructions — all auto-populated.',
    color: 'from-emerald-400 to-emerald-600',
  },
  {
    icon: CreditCard,
    title: 'Payment Tracking',
    desc: 'Track every insurer obligation through its full lifecycle: pending → demanded → paid (or disputed / partially paid). Dates, amounts, notes — and outstanding balances calculated automatically.',
    color: 'from-blue-400 to-blue-600',
  },
  {
    icon: Building2,
    title: 'Insurer Portal',
    desc: 'Give carrier reps their own read-only login. They see only their obligations — by matter, with running totals of what\'s owed and paid — and can update payment status directly.',
    color: 'from-pink-400 to-rose-500',
  },
  {
    icon: BookOpen,
    title: 'Document Management',
    desc: 'Attach coverage opinions, reservations of rights, settlement agreements, court filings, and mediation briefs directly to matters. Typed, organized, and always accessible.',
    color: 'from-teal-400 to-teal-600',
  },
  {
    icon: FileCheck,
    title: 'Audit-Ready Reports',
    desc: 'Export full apportionment reports and matter summary PDFs — complete calculation audit trails suitable for carrier submissions, court filings, and mediation packages.',
    color: 'from-indigo-400 to-indigo-600',
  },
  {
    icon: Shield,
    title: 'Role-Based Access',
    desc: 'Admin, User, and Client roles out of the box. Invitation-based onboarding. Each firm\'s data is fully isolated — no org can see another\'s matters, invoices, or insurer data.',
    color: 'from-slate-400 to-slate-600',
  },
]

const newFeatures = [
  { icon: Lock,      label: 'Two-Factor Authentication', desc: 'TOTP-based 2FA for all admin and user accounts.' },
  { icon: Bell,      label: 'Smart Notifications',       desc: 'Alerts when invoices are parsed, apportionments run, or payment status changes.' },
  { icon: Upload,    label: 'Create Matter from Invoice', desc: 'Spin up a new matter directly from an uploaded invoice — no extra steps.' },
  { icon: BarChart3, label: 'Apportionment Reports',     desc: 'Full-detail PDF reports of every calculation, ready to attach to demand packages.' },
  { icon: Sparkles,  label: 'Insurer Directory',         desc: 'Reusable org-level carrier contact book. Add an insurer once, use across all matters.' },
  { icon: Scale,     label: 'Policy Limit Monitoring',   desc: 'Automatic checks as cumulative payments approach each carrier\'s policy limit.' },
]

const steps = [
  { n: '01', title: 'Create a Matter',      desc: 'Add parties with share percentages and their insurers with policy periods, limits, and deductibles.' },
  { n: '02', title: 'Upload Invoices',       desc: 'Drop in a PDF. AI extracts every field. Review, confirm, and save in under a minute.' },
  { n: '03', title: 'Run Apportionment',    desc: 'Choose your calculation method. Every dollar is allocated across parties and insurers — day-exact.' },
  { n: '04', title: 'Generate & Demand',    desc: 'One click generates a Word demand letter per insurer. Track payments as they come in.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 lg:px-16 py-5 border-b border-white/5">
        <img src="/logo.svg" alt="LexAlloc" className="h-10 w-auto" />
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-slate-400 hover:text-white text-sm font-medium transition-colors">Sign In</Link>
          <Link to="/login" className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
            Get Started <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 lg:px-16 pt-24 pb-20 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500/15 border border-brand-500/25 rounded-full text-brand-300 text-xs font-semibold mb-8 tracking-wide uppercase">
          Legal Invoice Apportionment Platform
        </div>
        <h1 className="text-5xl lg:text-7xl font-bold text-white leading-[1.08] tracking-tight mb-6">
          Apportion Legal Fees<br />
          <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">With Precision</span>
        </h1>
        <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload invoices, define parties and insurers, and get defensible time-on-risk apportionment breakdowns — automatically. Built for coverage counsel, risk managers, and multi-insurer matters.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/login" className="inline-flex items-center gap-2 px-7 py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-brand-600/30">
            Start Free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="inline-flex items-center gap-2 px-7 py-3.5 bg-white/8 hover:bg-white/12 text-white font-medium rounded-xl transition-colors border border-white/10">
            Sign In
          </Link>
        </div>

        {/* Stats strip */}
        <div className="mt-16 grid grid-cols-3 gap-6 max-w-2xl mx-auto border-t border-white/5 pt-12">
          {[
            { value: '3', label: 'Apportionment Methods' },
            { value: '100%', label: 'Audit-Ready Output' },
            { value: '30s', label: 'Invoice Parse Time' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl font-bold text-white">{value}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-brand-400 text-sm font-semibold uppercase tracking-wider mb-3">How It Works</p>
          <h2 className="text-3xl font-bold text-white">From invoice to demand letter in four steps</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(({ n, title, desc }) => (
            <div key={n} className="relative bg-white/4 border border-white/8 rounded-2xl p-6">
              <p className="text-5xl font-black text-white/8 leading-none mb-4">{n}</p>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Core features */}
      <section className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-brand-400 text-sm font-semibold uppercase tracking-wider mb-3">Platform Features</p>
          <h2 className="text-3xl font-bold text-white">Everything you need for complex apportionments</h2>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">From AI-powered invoice parsing to automated demand letters — the full workflow in one platform.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {coreFeatures.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="group bg-white/4 hover:bg-white/7 border border-white/8 rounded-2xl p-6 transition-all duration-200">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-sm`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What's new */}
      <section className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-brand-900/40 to-violet-900/20 border border-brand-500/20 rounded-3xl p-10 lg:p-14">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500/20 border border-brand-500/30 rounded-full text-brand-300 text-xs font-semibold mb-4 uppercase tracking-wide">
              <Sparkles className="h-3 w-3" /> Recently Added
            </div>
            <h2 className="text-3xl font-bold text-white">What's new in LexAlloc</h2>
            <p className="text-slate-400 mt-2">The latest features shipped to the platform.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {newFeatures.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex gap-4 bg-white/5 border border-white/8 rounded-xl p-5">
                <div className="w-9 h-9 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-brand-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{label}</p>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-16 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Ready to simplify apportionment?</h2>
          <p className="text-slate-400 text-lg mb-8">Set up your organization in minutes. No credit card required.</p>
          <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all text-lg shadow-xl hover:shadow-brand-600/30">
            Create Your Account <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 px-6 lg:px-16 flex flex-col sm:flex-row items-center justify-between gap-4">
        <img src="/logo.svg" alt="LexAlloc" className="h-7 w-auto opacity-60" />
        <p className="text-slate-500 text-sm">© {new Date().getFullYear()} LexAlloc. Built for legal professionals.</p>
      </footer>
    </div>
  )
}
