import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  Layers, Search, Loader2, AlertTriangle, CheckCircle2, FolderOpen,
  ArrowRight, RefreshCcw,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

// ============================================================
// Duplicate Matters Tool
// Wraps the la_preview_duplicate_matters / la_consolidate_duplicate_matters
// RPCs (see supabase migration 043) in a UI button-driven workflow:
//   1. "Find Duplicates" — read-only preview.
//   2. "Consolidate"     — destructive merge with confirm modal.
// Auth is enforced server-side; only platform admins and org admins can use it.
// ============================================================

export default function DuplicateMattersTool() {
  const { profile }    = useAuth()
  const qc             = useQueryClient()

  const [scanning,     setScanning]     = useState(false)
  const [consolidating,setConsolidating]= useState(false)
  const [scanned,      setScanned]      = useState(false)   // has the user clicked "Find" at least once
  const [groups,       setGroups]       = useState([])
  const [confirmOpen,  setConfirmOpen]  = useState(false)
  const [lastResult,   setLastResult]   = useState(null)    // result of most recent consolidation

  const findDuplicates = async () => {
    if (!profile?.org_id) return
    setScanning(true)
    try {
      const { data, error } = await supabase.rpc('la_preview_duplicate_matters', {
        p_org_id: profile.org_id,
      })
      if (error) {
        toast.error('Could not load duplicates: ' + error.message)
        return
      }
      setGroups(data || [])
      setScanned(true)
      if (!data || data.length === 0) {
        toast.success('No duplicate matters found.')
      }
    } finally {
      setScanning(false)
    }
  }

  const runConsolidation = async () => {
    if (!profile?.org_id) return
    setConfirmOpen(false)
    setConsolidating(true)
    try {
      const { data, error } = await supabase.rpc('la_consolidate_duplicate_matters', {
        p_org_id: profile.org_id,
      })
      if (error) {
        toast.error('Consolidation failed: ' + error.message)
        return
      }
      setLastResult(data || [])
      // Refresh anything that might be showing matter counts
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      // Re-run the preview so the table reflects post-consolidation state (should be empty)
      await findDuplicates()
      const merged = (data || []).length
      toast.success(`Merged ${merged} duplicate matter${merged !== 1 ? 's' : ''}.`)
    } finally {
      setConsolidating(false)
    }
  }

  // Sum of all child rows that would move (for the headline number)
  const totalRowsToMove = groups.reduce((sum, g) =>
    sum + (g.invoices_to_move || 0)
        + (g.parties_to_move || 0)
        + (g.policy_periods_to_move || 0)
        + (g.apportionments_to_move || 0)
        + (g.documents_to_move || 0)
        + (g.notes_to_move || 0)
        + (g.settlements_to_move || 0)
        + (g.alerts_to_move || 0)
        + (g.audit_logs_to_repoint || 0), 0)

  const totalDuplicates = groups.reduce((sum, g) => sum + (g.duplicate_count - 1), 0)

  return (
    <div className="space-y-6">

      {/* ── Header card ───────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Layers className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Duplicate Matter Cleanup</h3>
            <p className="text-sm text-slate-500">
              Find matters in this org that share the same caption and merge their
              invoices, parties, apportionments, and history onto a single keeper.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 mb-5 text-sm text-slate-600 space-y-1">
          <p className="font-medium text-slate-700 mb-1.5">How it works</p>
          <div className="space-y-1">
            <p>1. <strong>Find Duplicates</strong> — read-only scan. Groups matters by normalized caption.</p>
            <p>2. Review the keeper (oldest matter) and the row counts that will move.</p>
            <p>3. <strong>Consolidate Now</strong> — repoints invoices/parties/etc. to the keeper, then deletes the empty duplicates.</p>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            A <code className="bg-slate-200 px-1 rounded">matter.consolidated</code> audit entry is written for each merge, so you can trace what happened. Children that collide on the keeper (e.g. two parties with the same name) are NOT auto-deduplicated — clean those up by hand.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={findDuplicates}
            disabled={scanning || consolidating}
            className="btn-primary flex items-center gap-2"
          >
            {scanning
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</>
              : <><Search className="h-4 w-4" /> {scanned ? 'Re-scan' : 'Find Duplicates'}</>
            }
          </button>
          {scanned && groups.length > 0 && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={scanning || consolidating}
              className="btn-secondary flex items-center gap-2 text-amber-700 border-amber-200 hover:bg-amber-50"
            >
              {consolidating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Consolidating…</>
                : <><Layers className="h-4 w-4" /> Consolidate {totalDuplicates} Duplicate{totalDuplicates !== 1 ? 's' : ''}</>
              }
            </button>
          )}
          {scanned && groups.length === 0 && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" /> No duplicates found.
            </span>
          )}
        </div>
      </div>

      {/* ── Results card ─────────────────────────────────────────── */}
      {scanned && groups.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900">{groups.length} duplicate group{groups.length !== 1 ? 's' : ''}</h3>
              <p className="text-sm text-slate-500">
                {totalDuplicates} matter{totalDuplicates !== 1 ? 's' : ''} will be merged into {groups.length} keeper{groups.length !== 1 ? 's' : ''} ·{' '}
                {totalRowsToMove} child row{totalRowsToMove !== 1 ? 's' : ''} will move
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((g, i) => (
              <DuplicateGroupRow key={g.normalized_key + i} group={g} />
            ))}
          </div>
        </div>
      )}

      {/* ── Most recent consolidation result ─────────────────────── */}
      {lastResult && lastResult.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-slate-900">Last consolidation</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            {lastResult.length} duplicate matter{lastResult.length !== 1 ? 's' : ''} merged. Each row below shows where the data went.
          </p>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold text-slate-500 px-3 py-2">Duplicate (deleted)</th>
                  <th className="text-left font-semibold text-slate-500 px-3 py-2">Keeper (preserved)</th>
                  <th className="text-left font-semibold text-slate-500 px-3 py-2">Rows moved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lastResult.map((r) => (
                  <tr key={r.duplicate_id}>
                    <td className="px-3 py-2 text-slate-600">{r.duplicate_name}</td>
                    <td className="px-3 py-2 text-slate-900 font-medium">{r.keeper_name}</td>
                    <td className="px-3 py-2 text-slate-500 font-mono">
                      {Object.entries(r.rows_moved || {})
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirm modal ────────────────────────────────────────── */}
      {confirmOpen && (
        <ConfirmConsolidate
          groups={groups}
          totalDuplicates={totalDuplicates}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={runConsolidation}
        />
      )}
    </div>
  )
}


// ── One row of the results table — shows keeper + dupes + counts ──
function DuplicateGroupRow({ group }) {
  const [expanded, setExpanded] = useState(false)

  const counts = [
    { key: 'invoices_to_move',       label: 'invoices' },
    { key: 'parties_to_move',        label: 'parties' },
    { key: 'policy_periods_to_move', label: 'policy periods' },
    { key: 'apportionments_to_move', label: 'apportionments' },
    { key: 'documents_to_move',      label: 'documents' },
    { key: 'notes_to_move',          label: 'notes' },
    { key: 'settlements_to_move',    label: 'settlements' },
    { key: 'alerts_to_move',         label: 'alerts' },
    { key: 'audit_logs_to_repoint',  label: 'audit logs' },
  ].filter(c => (group[c.key] || 0) > 0)

  const dupCount = group.duplicate_count - 1

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left"
      >
        <FolderOpen className="h-4 w-4 text-brand-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{group.keeper_name}</p>
          <p className="text-xs text-slate-500">
            {dupCount} duplicate{dupCount !== 1 ? 's' : ''} · keeper created{' '}
            {group.keeper_created_at ? format(parseISO(group.keeper_created_at), 'MMM d, yyyy') : '—'}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
          {counts.length > 0 && (
            <span>{counts.map(c => `${group[c.key]} ${c.label}`).join(' · ')}</span>
          )}
        </div>
        <RefreshCcw className={`h-3.5 w-3.5 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Keeper</p>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="font-medium text-slate-900">{group.keeper_name}</span>
              <span className="text-xs text-slate-400 font-mono">{group.keeper_id}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Duplicates ({dupCount}) — will be deleted
            </p>
            <div className="space-y-1">
              {(group.duplicate_ids || []).map((id, idx) => (
                <div key={id} className="flex items-center gap-2 text-sm">
                  <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-slate-700">{group.duplicate_names?.[idx] || group.keeper_name}</span>
                  <span className="text-xs text-slate-400 font-mono">{id}</span>
                </div>
              ))}
            </div>
          </div>
          {counts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Rows that will move to keeper</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {counts.map(c => (
                  <div key={c.key} className="bg-white border border-slate-200 rounded px-2 py-1.5">
                    <p className="text-base font-semibold text-slate-900">{group[c.key]}</p>
                    <p className="text-xs text-slate-500">{c.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Confirm modal before destructive action ──
function ConfirmConsolidate({ groups, totalDuplicates, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 p-6 border-b border-slate-200">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Consolidate duplicate matters?</h2>
            <p className="text-sm text-slate-500">This cannot be undone from the UI.</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
            <p>
              <strong>{totalDuplicates}</strong> duplicate matter{totalDuplicates !== 1 ? 's' : ''} will be deleted. Their invoices, parties, apportionments, and history will be repointed to the {groups.length} keeper{groups.length !== 1 ? 's' : ''} shown in the preview.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              An audit log entry is written for every merge so the action is fully traceable.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Tip: if you want a final dry-run first, run <code className="bg-slate-100 px-1 rounded">la_consolidate_duplicate_matters</code> inside <code className="bg-slate-100 px-1 rounded">BEGIN; … ROLLBACK;</code> in the Supabase SQL editor before clicking Confirm.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn-primary bg-amber-600 hover:bg-amber-700">
            <Layers className="h-4 w-4" /> Yes, consolidate
          </button>
        </div>
      </div>
    </div>
  )
}
