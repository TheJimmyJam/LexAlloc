import { Link } from 'react-router-dom'
import {
  FileText, Users, PieChart, Shield, CheckCircle,
  ArrowRight, Upload, Cpu, BarChart3, Building2, UserCheck,
  Clock, Lock, Zap, ChevronRight, Star, Scale
} from 'lucide-react'

// ─── Feature Cards ────────────────────────────────────────────────────────────
const features = [
  {
    icon: Upload,
    color: 'bg-blue-500/20 text-blue-400',
    title: 'AI Invoice Parsing',
    desc: 'Upload any PDF invoice and our AI reads it — extracting line items, timekeepers, hours, rates, and billing periods automatically. No manual data entry.',
  },
  {
    icon: Users,
    color: 'bg-purple-500/20 text-purple-400',
    title: 'Multi-Party Apportionment',
    desc: 'Define parties and their service obligation dates. Every invoice dollar is allocated pro-rata to the parties responsible for that service period.',
  },
  {
    icon: Clock,
    color: 'bg-amber-500/20 text-amber-400',
    title: 'Time-on-Risk Analysis',
    desc: 'Pro-rata insurer obligations calculated to the exact day. Overlapping and sequential policy periods are handled automatically — no spreadsheets required.',
  },
  {
    icon: Building2,
    color: 'bg-green-500/20 text-green-400',
    title: 'Insurer Breakdowns',
    desc: 'Per-insurer obligation reports showing policy period overlaps, days-on-risk, claim numbers, and dollar obligations — ready for invoicing.',
  },
  {
    icon: Shield,
    color: 'bg-rose-500/20 text-rose-400',
    title: 'Insurer / Client Portal',
    desc: 'Give insurer reps their own login. They see only their payment obligations across all matters — amounts owed, amounts paid, and current status.',
  },
  {
    icon: BarChart3,
    color: 'bg-cyan-500/20 text-cyan-400',
    title: 'Audit-Ready Reports',
    desc: 'Defensible, itemized breakdowns exportable for carriers, coverage counsel, mediations, and litigation. Clean output every time.',
  },
  {
    icon: Lock,
    color: 'bg-indigo-500/20 text-indigo-400',
    title: 'Role-Based Access',
    desc: 'Admins, attorneys, and client/insurer reps each get a tailored view. Sensitive matter data never leaks to the wrong party.',
  },
  {
    icon: Zap,
    color: 'bg-orange-500/20 text-orange-400',
    title: 'Multi-Matter Management',
    desc: 'Handle dozens of matters simultaneously. Dashboard KPIs give you an instant pulse on total invoiced, apportionments run, and outstanding obligations.',
  },
]

// ─── How It Works ─────────────────────────────────────────────────────────────
const steps = [
  {
    num: '01',
    title: 'Create a Matter',
    desc: 'Set up a matter with a name, number, and status. Attach parties with their service obligation dates and insurers with policy periods.',
  },
  {
    num: '02',
    title: 'Upload Invoices',
    desc: 'Drop in a PDF invoice. AI extracts the invoice number, date, billing firm, line items, and service period — ready to review in seconds.',
  },
  {
    num: '03',
    title: 'Run Apportionment',
    desc: 'One click calculates each party\'s dollar obligation and each insurer\'s time-on-risk share across all policy periods. Full audit trail included.',
  },
  {
    num: '04',
    title: 'Demand & Track',
    desc: 'Generate per-insurer demands. Insurer reps log in to their portal to see what\'s owed, update payment status, and track balances — all in real time.',
  },
]

// ─── Who It's For ─────────────────────────────────────────────────────────────
const personas = [
  {
    icon: Scale,
    role: 'Coverage Counsel',
    desc: 'Run defensible apportionments on complex multi-insurer, multi-party matters without a spreadsheet. Build and export demand-ready breakdowns in minutes.',
  },
  {
    icon: UserCheck,
    role: 'Risk Managers',
    desc: 'Monitor all active matters from a single dashboard. See outstanding obligations, track invoice history, and stay ahead of payment disputes.',
  },
  {
    icon: Building2,
    role: 'Insurer Representatives',
    desc: 'Log in to your dedicated portal to see every matter you\'re involved in, what you owe, what you\'ve paid, and where each payment stands.',
  },
  {
    icon: Users,
    role: 'Legal Operations Teams',
    desc: 'Onboard your entire firm. Invite attorneys and billing staff as users, assign client-role access for insurers, and keep data fully partitioned by org.',
  },
]

// ─── Stat Strip ───────────────────────────────────────────────────────────────
const stats = [
  { value: 'AI-Powered', label: 'Invoice extraction' },
  { value: 'Day-Exact', label: 'Time-on-risk math' },
  { value: 'Multi-Tenant', label: 'Firm data isolation' },
  { value: 'Real-Time', label: 'Insurer portal updates' },
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
      <section className="relative px-6 lg:px-16 pt-12 pb-32 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-600/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          {/* Logo lockup */}
          <div className="flex justify-center mb-6">
            <img src="/logo-icon.png" alt="LexAlloc" className="rounded-full" style={{ width: '120px', height: '120px', objectFit: 'cover' }} />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500/15 border border-brand-500/25 rounded-full text-brand-300 text-xs font-medium mb-6">
            <Star className="h-3 w-3 fill-brand-400 text-brand-400" /> Legal Invoice Apportionment — Rebuilt for the Modern Era
          </div>

          <h1 className="text-5xl lg:text-7xl font-extrabold leading-tight mb-6 tracking-tight">
            Apportion Legal Fees<br />
            <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
              With Surgical Precision
            </span>
          </h1>

          <p className="text-slate-300 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload invoices, define parties and insurers, and get defensible
            time-on-risk apportionment breakdowns — automatically.
            Built for coverage counsel, risk managers, and multi-insurer matters.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register"
              className="flex items-center gap-2 px-7 py-3.5 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-400/30 hover:-translate-y-0.5">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login"
              className="flex items-center gap-2 px-7 py-3.5 bg-white/8 hover:bg-white/15 text-white font-medium rounded-xl border border-white/15 transition-all">
              Log In to Your Account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats Strip ─────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/3">
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-extrabold text-white mb-1">{value}</p>
              <p className="text-slate-400 text-sm">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white">From invoice to demand in four steps</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(({ num, title, desc }) => (
            <div key={num} className="relative bg-white/4 hover:bg-white/7 border border-white/8 rounded-2xl p-6 transition-colors group">
              <div className="text-5xl font-black text-white/8 group-hover:text-white/12 transition-colors mb-4 leading-none">{num}</div>
              <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-24 bg-white/2 border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-white">Everything you need for complex apportionments</h2>
            <p className="text-slate-400 mt-4 max-w-xl mx-auto">
              LexAlloc handles every step — from invoice ingestion to insurer-facing portals — so your team can focus on legal strategy, not spreadsheets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="bg-white/4 hover:bg-white/8 border border-white/8 rounded-2xl p-6 transition-all hover:-translate-y-0.5 group">
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
      <section className="px-6 lg:px-16 py-24 max-w-6xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-brand-900/60 to-slate-900 border border-brand-500/20 p-10 lg:p-16 overflow-hidden relative">
          <div className="absolute right-0 top-0 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500/15 border border-brand-500/25 rounded-full text-brand-300 text-xs font-medium mb-5">
                <Cpu className="h-3 w-3" /> AI-Powered
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                Invoice parsing that actually works
              </h2>
              <p className="text-slate-300 leading-relaxed mb-6">
                Upload any law firm invoice as a PDF and LexAlloc's AI reads the whole thing — invoice number, dates, billing firm, every line item with timekeeper, hours, rate, and amount. What used to take 30 minutes per invoice now takes 10 seconds.
              </p>
              <ul className="space-y-3">
                {[
                  'Handles any PDF invoice format',
                  'Extracts all line items automatically',
                  'Review and correct before saving',
                  'Falls back to manual entry if needed',
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
              <p className="text-slate-300"><span className="text-brand-400">invoice_date</span>: <span className="text-green-400">"2024-09-30"</span></p>
              <p className="text-slate-300"><span className="text-brand-400">billing_firm</span>: <span className="text-green-400">"Hensley & Partners LLP"</span></p>
              <p className="text-slate-300"><span className="text-brand-400">total_amount</span>: <span className="text-amber-400">48250.00</span></p>
              <p className="text-slate-500 mt-3">// line_items (34 extracted)</p>
              <p className="text-slate-300"><span className="text-purple-400">timekeeper</span>: <span className="text-green-400">"J. Cannon"</span> · <span className="text-amber-400">6.5h</span> @ <span className="text-amber-400">$495/hr</span></p>
              <p className="text-slate-300"><span className="text-purple-400">description</span>: <span className="text-green-400">"Review coverage position..."</span></p>
              <p className="text-slate-500">…</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who It's For ────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-24 bg-white/2 border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3">Who It's For</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-white">Built for everyone in the apportionment chain</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {personas.map(({ icon: Icon, role, desc }) => (
              <div key={role} className="bg-white/4 border border-white/8 rounded-2xl p-6 hover:bg-white/7 transition-colors">
                <div className="w-11 h-11 bg-brand-500/15 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-brand-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">{role}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-24 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to simplify apportionment?
          </h2>
          <p className="text-slate-300 text-lg mb-8">
            Set up your organization in minutes. Invite your team. Upload your first invoice and see apportionment results immediately.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register"
              className="flex items-center gap-2 px-7 py-3.5 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-500/25 hover:-translate-y-0.5">
              Create Your Account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login"
              className="flex items-center gap-2 px-7 py-3.5 bg-white/8 hover:bg-white/15 text-white font-medium rounded-xl border border-white/15 transition-all">
              Log In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 px-6 lg:px-16 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <img src="/logo-icon.png" alt="LexAlloc" className="rounded-full" style={{ width: '36px', height: '36px', objectFit: 'cover' }} />
          </div>
          <p className="text-slate-500 text-sm">© {new Date().getFullYear()} LexAlloc. Built for legal professionals.</p>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
            <Link to="/register" className="text-slate-400 hover:text-white transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
