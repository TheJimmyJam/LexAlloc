import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { FolderOpen, FileText, DollarSign, TrendingUp, Plus, ArrowRight, ChevronRight, Briefcase, Upload } from 'lucide-react'
import InvoiceUploadModal from '../components/InvoiceUploadModal.jsx'
import { formatCurrency } from '../lib/calculations.js'
import { format, parseISO } from 'date-fns'
import OnboardingWizard from '../components/OnboardingWizard.jsx'
import OnboardingChecklist from '../components/OnboardingChecklist.jsx'

const STATUS_LABELS = { active: 'Active', closed: 'Closed', on_hold: 'On Hold', pending: 'On Hold' }

function FirmColumn({ firm, statusColors }) {
  const matters = [...(firm.la_matters || [])].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col w-60 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 rounded-t-xl border border-slate-200 border-b-0">
        <Briefcase className="h-3.5 w-3.5 text-brand-500 flex-shrink-0" />
        <span className="font-semibold text-slate-800 text-xs truncate flex-1">{firm.name}</span>
        <span className="text-xs text-slate-400 font-normal flex-shrink-0">{matters.length}</span>
      </div>

      {/* Matter cards */}
      <div className="flex flex-col gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-b-xl min-h-[60px]">
        {matters.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">No matters</p>
        ) : (
          matters.map(m => (
            <Link
              key={m.id}
              to={`/matters/${m.id}`}
              className="bg-white rounded-lg px-3 py-2.5 border border-slate-200 hover:border-brand-300 hover:shadow-sm transition-all block"
            >
              <p className="text-xs font-medium text-slate-800 leading-snug line-clamp-2">{m.name}</p>
              <div className="flex items-center justify-between mt-1.5 gap-1">
                {m.matter_number
                  ? <span className="text-[10px] text-slate-400">#{m.matter_number}</span>
                  : <span />}
                <span className={`badge text-[10px] px-1.5 py-0.5 ${statusColors[m.status] || 'bg-slate-100 text-slate-500'} flex-shrink-0`}>
                  {STATUS_LABELS[m.status] ?? m.status}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, gradient, to }) {
  return (
    <Link to={to} className="card p-5 block hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-semibold text-slate-900 mt-2 tracking-tight">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${gradient} group-hover:scale-110 transition-transform duration-150`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-slate-400 group-hover:text-brand-600 transition-colors">
        View details <ChevronRight className="h-3 w-3" />
      </div>
    </Link>
  )
}

const statusColors = {
  active:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
  closed:      'bg-slate-100 text-slate-500',
  pending:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
  draft:       'bg-slate-100 text-slate-500',
  parsed:      'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60',
  apportioned: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/60',
}

// (onboarding flags now stored in la_organizations — no localStorage)

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  if (profile?.role === 'client') return <Navigate to="/portal" replace />

  const orgId = profile?.org_id

  // ── Wizard / checklist state ────────────────────────────────────────────────
  const [showWizard,         setShowWizard]         = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(false)
  const [showUploadInvoice,  setShowUploadInvoice]  = useState(false)

  // ── Load onboarding flags from DB (cross-device) ─────────────────────────────
  const { data: orgFlags } = useQuery({
    queryKey: ['org-onboarding-flags', orgId],
    enabled:  !!orgId,
    queryFn:  async () => {
      const { data } = await supabase
        .from('la_organizations')
        .select('onboarding_wizard_seen, onboarding_checklist_dismissed')
        .eq('id', orgId)
        .single()
      return data
    },
  })

  // Sync local state from DB once loaded
  useEffect(() => {
    if (orgFlags?.onboarding_checklist_dismissed) setChecklistDismissed(true)
  }, [orgFlags?.onboarding_checklist_dismissed])

  // ── Dashboard stats (includes parties for checklist) ────────────────────────
  const { data: stats, isSuccess: statsLoaded } = useQuery({
    queryKey: ['dashboard-stats', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [mattersRes, invoicesRes, apportRes, partiesRes] = await Promise.all([
        supabase.from('la_matters').select('id', { count: 'exact' }).eq('org_id', orgId).eq('is_template', false),
        supabase.from('la_invoices').select('id, total_amount', { count: 'exact' }).eq('org_id', orgId),
        supabase.from('la_apportionments').select('id', { count: 'exact' }).eq('org_id', orgId),
        supabase.from('la_parties').select('id', { count: 'exact' }).eq('org_id', orgId),
      ])
      const totalInvoiced = invoicesRes.data?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0
      return {
        matters:        mattersRes.count        || 0,
        invoices:       invoicesRes.count        || 0,
        apportionments: apportRes.count         || 0,
        parties:        partiesRes.count         || 0,
        totalInvoiced,
      }
    },
  })

  // ── Auto-launch wizard for new orgs ─────────────────────────────────────────
  useEffect(() => {
    if (!statsLoaded || !orgId || orgFlags === undefined) return
    if (stats.matters === 0 && !orgFlags?.onboarding_wizard_seen) {
      setShowWizard(true)
    }
  }, [statsLoaded, stats?.matters, orgId, orgFlags])

  // ── Wizard completed / dismissed ────────────────────────────────────────────
  const handleWizardComplete = useCallback(async () => {
    setShowWizard(false)
    if (orgId) {
      await supabase.from('la_organizations')
        .update({ onboarding_wizard_seen: true })
        .eq('id', orgId)
    }
  }, [orgId])

  // ── Checklist dismiss ────────────────────────────────────────────────────────
  const handleDismissChecklist = useCallback(async () => {
    setChecklistDismissed(true) // optimistic
    if (orgId) {
      await supabase.from('la_organizations')
        .update({ onboarding_checklist_dismissed: true })
        .eq('id', orgId)
    }
  }, [orgId])

  // ── Recent data ──────────────────────────────────────────────────────────────
  const { data: recentMatters } = useQuery({
    queryKey: ['recent-matters', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matters')
        .select('id, name, matter_number, status, created_at')
        .eq('org_id', orgId)
        .eq('is_template', false)
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    },
  })

  const { data: recentInvoices } = useQuery({
    queryKey: ['recent-invoices', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_invoices')
        .select('id, invoice_number, invoice_date, total_amount, status, matter_id, la_matters(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    },
  })

  const { data: firmsWithMatters } = useQuery({
    queryKey: ['dashboard-firms', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_firms')
        .select('id, name, la_matters(id, name, matter_number, status)')
        .eq('org_id', orgId)
        .order('name')
      return data || []
    },
  })

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  // ── Checklist steps ──────────────────────────────────────────────────────────
  const checklistSteps = stats ? [
    {
      id:          'matter',
      label:       'Create your first matter',
      done:        stats.matters > 0,
      actionLabel: 'Create now',
      actionOnClick: () => setShowWizard(true),
    },
    {
      id:          'party',
      label:       'Add a responsible party',
      done:        stats.parties > 0,
      actionLabel: 'Go to Matters',
      actionTo:    '/matters',
    },
    {
      id:          'invoice',
      label:       'Upload your first invoice',
      done:        stats.invoices > 0,
      actionLabel: 'Go to Matters',
      actionTo:    '/matters',
    },
    {
      id:          'apportionment',
      label:       'Run your first apportionment',
      done:        stats.apportionments > 0,
      actionLabel: 'Go to Matters',
      actionTo:    '/matters',
    },
  ] : []

  const allStepsDone = checklistSteps.length > 0 && checklistSteps.every(s => s.done)

  // Show checklist if: steps available, not dismissed (unless all done — keep it visible briefly)
  const showChecklist = checklistSteps.length > 0 && !checklistDismissed

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Good {greeting}, {profile?.first_name || 'there'}
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Here's what's happening with your matters.</p>
      </div>

      {/* Onboarding checklist */}
      {showChecklist && (
        <OnboardingChecklist
          steps={checklistSteps}
          onDismiss={handleDismissChecklist}
          onLaunchWizard={() => setShowWizard(true)}
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FolderOpen} label="Active Matters"     value={stats?.matters || 0}                       gradient="bg-gradient-to-br from-brand-500 to-brand-700"   to="/matters" />
        <StatCard icon={FileText}   label="Invoices Processed" value={stats?.invoices || 0}                      gradient="bg-gradient-to-br from-blue-400 to-blue-600"     to="/matters" />
        <StatCard icon={TrendingUp} label="Apportionments Run" value={stats?.apportionments || 0}                gradient="bg-gradient-to-br from-violet-400 to-violet-600" to="/matters" />
        <StatCard icon={DollarSign} label="Total Invoiced"     value={formatCurrency(stats?.totalInvoiced || 0)} gradient="bg-gradient-to-br from-emerald-400 to-emerald-600" to="/matters" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Matters */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Matters</h2>
            <Link to="/matters" className="text-brand-600 hover:text-brand-700 text-xs font-medium flex items-center gap-1 transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentMatters?.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">
                No matters yet.{' '}
                <button
                  onClick={() => setShowWizard(true)}
                  className="text-brand-600 hover:underline"
                >
                  Create your first matter
                </button>
              </div>
            )}
            {recentMatters?.map((m) => (
              <Link key={m.id} to={`/matters/${m.id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/80 transition-colors">
                <div className="min-w-0 mr-4">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.matter_number || 'No number'} · {format(parseISO(m.created_at), 'MMM d, yyyy')}</p>
                </div>
                <span className={`badge ${statusColors[m.status] || 'bg-slate-100 text-slate-500'} flex-shrink-0 capitalize`}>{m.status}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Invoices</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {recentInvoices?.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">No invoices uploaded yet.</div>
            )}
            {recentInvoices?.map((inv) => (
              <Link key={inv.id} to={`/matters/${inv.matter_id}/invoices/${inv.id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/80 transition-colors">
                <div className="min-w-0 mr-4">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {inv.invoice_number || 'Invoice'} — {inv.la_matters?.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {inv.invoice_date ? format(parseISO(inv.invoice_date), 'MMM d, yyyy') : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(inv.total_amount)}</p>
                  <span className={`badge ${statusColors[inv.status] || 'bg-slate-100 text-slate-500'} capitalize`}>{inv.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Firms — Kanban */}
      {firmsWithMatters && firmsWithMatters.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-400" /> Firms
            </h2>
            <Link to="/settings" className="text-brand-600 hover:text-brand-700 text-xs font-medium flex items-center gap-1 transition-colors">
              Manage firms <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {firmsWithMatters.map(firm => (
                <FirmColumn key={firm.id} firm={firm} statusColors={statusColors} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-6 card p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setShowWizard(true)} className="btn-primary"><Plus className="h-4 w-4" /> New Matter</button>
          <button onClick={() => setShowUploadInvoice(true)} className="btn-secondary"><Upload className="h-4 w-4" /> Upload Invoice</button>
        </div>
      </div>

      {/* Onboarding wizard */}
      {showWizard && profile && (
        <OnboardingWizard
          profile={profile}
          onComplete={handleWizardComplete}
        />
      )}

      {/* Global invoice upload — no matterId: modal matches/creates matter automatically */}
      {showUploadInvoice && (
        <InvoiceUploadModal
          onClose={() => setShowUploadInvoice(false)}
        />
      )}
    </div>
  )
}
