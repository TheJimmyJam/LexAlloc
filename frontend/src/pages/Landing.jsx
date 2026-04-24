import { Link } from 'react-router-dom'
import { Scale, FileText, Users, PieChart, Shield, CheckCircle, ArrowRight } from 'lucide-react'

const features = [
  { icon: FileText,   title: 'AI Invoice Parsing',       desc: 'Upload PDF invoices and let our AI extract line items, dates, timekeepers, and amounts automatically.' },
  { icon: Users,      title: 'Multi-Party Apportionment', desc: 'Define parties and their share percentages. Every dollar of every invoice is tracked to its responsible party.' },
  { icon: PieChart,   title: 'Time-on-Risk Analysis',    desc: 'Pro-rata insurer obligations calculated to the day — across overlapping and sequential policy periods.' },
  { icon: Shield,     title: 'Insurer Breakdowns',       desc: 'Detailed per-insurer obligation reports with policy period overlaps, days-on-risk, and dollar amounts.' },
  { icon: CheckCircle,title: 'Audit-Ready Reports',      desc: 'Export clean, defensible breakdowns for carriers, coverage counsel, and mediations.' },
  { icon: Scale,      title: 'Multi-Tenant & Secure',    desc: 'Each firm or client has fully isolated data. Role-based access for admins, attorneys, and clients.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 lg:px-16 py-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Scale className="h-4 w-4 text-white" />
          </div>
          <span className="text-white font-bold text-xl">LexAlloc</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login"    className="text-slate-300 hover:text-white text-sm transition-colors">Sign In</Link>
          <Link to="/register" className="px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 lg:px-16 py-24 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500/20 border border-brand-500/30 rounded-full text-brand-300 text-xs font-medium mb-6">
          <Scale className="h-3 w-3" /> Legal Invoice Apportionment Platform
        </div>
        <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
          Apportion Legal Fees<br />
          <span className="text-brand-400">With Precision</span>
        </h1>
        <p className="text-slate-300 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload invoices, define parties and insurers, and get defensible time-on-risk apportionment breakdowns — automatically. Built for coverage counsel, risk managers, and multi-insurer matters.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/register" className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-colors">
            Start Free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors border border-white/20">
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center mb-12">Everything you need for complex apportionments</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-6 transition-colors">
              <div className="w-10 h-10 bg-brand-500/20 rounded-lg flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-brand-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 lg:px-16 py-16 text-center">
        <div className="max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-10">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to simplify apportionment?</h2>
          <p className="text-slate-300 mb-6">Set up your organization in minutes. No credit card required.</p>
          <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-colors">
            Create Your Account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="text-center py-8 text-slate-500 text-sm border-t border-white/5">
        © {new Date().getFullYear()} LexAlloc. Built for legal professionals.
      </footer>
    </div>
  )
}
