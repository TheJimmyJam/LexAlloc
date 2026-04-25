import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import {
  Sparkles, ArrowRight, ArrowLeft, Check, X,
  FolderOpen, Users, Upload, Calculator, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? 'w-5 h-2 bg-brand-600'
              : i === current
              ? 'w-5 h-2 bg-brand-400'
              : 'w-2 h-2 bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

const INPUT_CLS =
  'w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow placeholder:text-slate-300'

// ── Next-steps card ───────────────────────────────────────────────────────────
function NextStepCard({ icon: Icon, color, title, body, to, label, onClick }) {
  return (
    <a
      href={to}
      onClick={e => { e.preventDefault(); onClick() }}
      className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/40 transition-all group cursor-pointer"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-brand-700">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{body}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover:text-brand-400 flex-shrink-0 mt-0.5" />
    </a>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function OnboardingWizard({ profile, onComplete }) {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [step, setStep] = useState(0)       // 0=welcome 1=matter 2=party 3=done

  // Step 1 — matter fields
  const [matterName,   setMatterName]   = useState('')
  const [matterNumber, setMatterNumber] = useState('')
  const [matterDesc,   setMatterDesc]   = useState('')

  // Step 2 — party fields
  const [partyName,     setPartyName]     = useState('')
  const [partyFromDate, setPartyFromDate] = useState('')
  const [partyToDate,   setPartyToDate]   = useState('')

  // Created IDs
  const [createdMatterId, setCreatedMatterId] = useState(null)
  const [partySkipped,    setPartySkipped]    = useState(false)

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createMatterMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('la_matters')
        .insert({
          name:          matterName.trim(),
          matter_number: matterNumber.trim() || null,
          description:   matterDesc.trim()   || null,
          org_id:        profile.org_id,
          status:        'active',
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: (id) => {
      setCreatedMatterId(id)
      qc.invalidateQueries(['matters'])
      qc.invalidateQueries(['dashboard-stats'])
      setStep(2)
    },
    onError: (e) => toast.error('Could not create matter: ' + e.message),
  })

  const createPartyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('la_parties')
        .insert({
          matter_id:             createdMatterId,
          org_id:                profile.org_id,
          name:                  partyName.trim(),
          date_responsible_from: partyFromDate || null,
          date_responsible_to:   partyToDate   || null,
        })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['matter-parties', createdMatterId])
      qc.invalidateQueries(['dashboard-stats'])
      setStep(3)
    },
    onError: (e) => toast.error('Could not add party: ' + e.message),
  })

  const handleSkipParty = () => {
    setPartySkipped(true)
    setStep(3)
  }

  const goToMatter = (tabParam = '') => {
    onComplete(createdMatterId)
    navigate(`/matters/${createdMatterId}${tabParam}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-brand-500 via-brand-400 to-violet-400" />

        {/* Dismiss */}
        <button
          onClick={() => onComplete(createdMatterId)}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600 z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Step 0: Welcome ──────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to LexAlloc!</h2>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
              Let's get you set up in about 2 minutes. We'll create your first matter and walk you through the key steps together.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-left bg-slate-50 rounded-xl px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <p className="text-sm text-slate-600">Create your first <strong>matter</strong></p>
              </div>
              <div className="flex items-center gap-3 text-left bg-slate-50 rounded-xl px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <p className="text-sm text-slate-600">Add a <strong>responsible party</strong></p>
              </div>
              <div className="flex items-center gap-3 text-left bg-slate-50 rounded-xl px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <p className="text-sm text-slate-600">See exactly <strong>what to do next</strong></p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => onComplete(null)}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip setup
              </button>
              <button
                onClick={() => setStep(1)}
                className="btn-primary flex items-center gap-2 px-6"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Create Matter ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Step 1 of 2</p>
              <StepDots current={1} total={3} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Create your first matter</h2>
            <p className="text-sm text-slate-500 mb-6">
              A matter tracks a single claim or case — all parties, invoices, and apportionments live here.
            </p>

            <div className="space-y-4">
              <Field label="Matter Name" required>
                <input
                  type="text"
                  autoFocus
                  value={matterName}
                  onChange={e => setMatterName(e.target.value)}
                  placeholder="e.g. Smith v. ABC Corp"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Matter Number" hint="Your internal reference number (optional)">
                <input
                  type="text"
                  value={matterNumber}
                  onChange={e => setMatterNumber(e.target.value)}
                  placeholder="e.g. 2024-CV-001"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Description">
                <textarea
                  rows={2}
                  value={matterDesc}
                  onChange={e => setMatterDesc(e.target.value)}
                  placeholder="Brief description of the case (optional)"
                  className={`${INPUT_CLS} resize-none`}
                />
              </Field>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep(0)}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                onClick={() => createMatterMutation.mutate()}
                disabled={!matterName.trim() || createMatterMutation.isPending}
                className="btn-primary flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMatterMutation.isPending ? 'Creating…' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Add Party ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Step 2 of 2</p>
              <StepDots current={2} total={3} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Add a responsible party</h2>
            <p className="text-sm text-slate-500 mb-6">
              Parties are defendants, policyholders, or other responsible entities. Costs get apportioned between their insurers based on the dates they were responsible.
            </p>

            <div className="space-y-4">
              <Field label="Party Name" required>
                <input
                  type="text"
                  autoFocus
                  value={partyName}
                  onChange={e => setPartyName(e.target.value)}
                  placeholder="e.g. ABC Corporation"
                  className={INPUT_CLS}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Responsible From" hint="When their liability began">
                  <input
                    type="date"
                    value={partyFromDate}
                    onChange={e => setPartyFromDate(e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label="Responsible To" hint="When liability ended">
                  <input
                    type="date"
                    value={partyToDate}
                    onChange={e => setPartyToDate(e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={handleSkipParty}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={() => createPartyMutation.mutate()}
                disabled={!partyName.trim() || createPartyMutation.isPending}
                className="btn-primary flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createPartyMutation.isPending ? 'Adding…' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: All set ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="p-8">
            <StepDots current={3} total={3} />
            <div className="mt-4 flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">You're all set!</h2>
                <p className="text-sm text-slate-500">
                  {partySkipped
                    ? 'Your matter has been created.'
                    : 'Your matter and first party are ready.'}
                </p>
              </div>
            </div>

            {/* Matter name badge */}
            {matterName && (
              <div className="my-5 flex items-center gap-3 bg-brand-50 border border-brand-100 rounded-xl px-4 py-3">
                <FolderOpen className="h-4 w-4 text-brand-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-brand-800 truncate">{matterName}</span>
              </div>
            )}

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              What to do next
            </p>
            <div className="space-y-2">
              {partySkipped && (
                <NextStepCard
                  icon={Users}
                  color="bg-violet-500"
                  title="Add a responsible party"
                  body="Go to the Parties tab to add defendants or policyholders."
                  to="#"
                  label="Go"
                  onClick={() => goToMatter('?tab=parties')}
                />
              )}
              <NextStepCard
                icon={Users}
                color="bg-indigo-500"
                title="Add insurers & policy periods"
                body="Expand a party in the Parties tab and add their insurance carriers."
                to="#"
                label="Go"
                onClick={() => goToMatter('?tab=parties')}
              />
              <NextStepCard
                icon={Upload}
                color="bg-sky-500"
                title="Upload your first invoice"
                body="Drop a PDF invoice in the Invoices tab to start apportioning costs."
                to="#"
                label="Go"
                onClick={() => goToMatter('?tab=invoices')}
              />
              <NextStepCard
                icon={Calculator}
                color="bg-emerald-500"
                title="Run your first apportionment"
                body="Once invoices and insurers are set up, run calculations in the Apportionments tab."
                to="#"
                label="Go"
                onClick={() => goToMatter('?tab=apportionments')}
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => onComplete(createdMatterId)}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Back to dashboard
              </button>
              <button
                onClick={() => goToMatter()}
                className="btn-primary flex items-center gap-2 px-6"
              >
                Go to your matter
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
