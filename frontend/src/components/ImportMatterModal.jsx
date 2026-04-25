import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  X, Search, Download, CheckCircle2, AlertCircle,
  Users, ChevronRight, Loader2, RefreshCcw, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'

const PROVIDER_META = {
  clio:     { label: 'Clio',      color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  filevine: { label: 'FileVine',  color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
}

const STATUS_COLORS = {
  Open:     'bg-green-100 text-green-700',
  Active:   'bg-green-100 text-green-700',
  Closed:   'bg-slate-100 text-slate-600',
  Pending:  'bg-amber-100 text-amber-700',
  Unknown:  'bg-slate-100 text-slate-500',
}

function statusColor(s) {
  return STATUS_COLORS[s] ?? 'bg-slate-100 text-slate-500'
}

export default function ImportMatterModal({ availableProviders = [], onClose }) {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [provider, setProvider] = useState(availableProviders[0] ?? 'clio')
  const [search,   setSearch]   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [importing, setImporting] = useState(null)  // external_id being imported
  const debounceRef = useRef(null)

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  // Fetch remote matters from edge function
  const { data: remoteMatters = [], isLoading, error, refetch } = useQuery({
    queryKey: ['pm-matters', provider, profile?.org_id, debouncedSearch],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('import-pm-matters', {
        body: { provider, org_id: profile.org_id, search: debouncedSearch },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      return data?.matters ?? []
    },
    enabled: !!profile?.org_id && availableProviders.includes(provider),
    retry: false,
  })

  // Fetch existing imported matter external_ids for dedup
  const { data: existingExternalIds = new Set() } = useQuery({
    queryKey: ['existing-external-ids', profile?.org_id, provider],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matters')
        .select('external_id')
        .eq('org_id', profile.org_id)
        .eq('external_source', provider)
        .not('external_id', 'is', null)
      return new Set((data ?? []).map(m => m.external_id))
    },
    enabled: !!profile?.org_id,
  })

  const importMatter = async (remote) => {
    setImporting(remote.external_id)
    try {
      // Compute equal share percentages for each party
      const partyCount   = remote.parties.length
      const equalShare   = partyCount > 0 ? parseFloat((100 / partyCount).toFixed(4)) : 0
      const lastShare    = partyCount > 0
        ? parseFloat((100 - equalShare * (partyCount - 1)).toFixed(4))
        : 0

      // Create matter
      const { data: matter, error: mErr } = await supabase
        .from('la_matters')
        .insert({
          org_id:          profile.org_id,
          name:            remote.name,
          matter_number:   remote.matter_number || null,
          status:          'active',
          created_by:      profile.id,
          external_source: remote.source,
          external_id:     remote.external_id,
        })
        .select()
        .single()

      if (mErr) throw new Error(mErr.message)

      // Create parties if any
      if (remote.parties.length > 0) {
        const partyRows = remote.parties.map((p, i) => ({
          matter_id:        matter.id,
          org_id:           profile.org_id,
          name:             p.name,
          share_percentage: i === partyCount - 1 ? lastShare : equalShare,
        }))
        const { error: pErr } = await supabase.from('la_parties').insert(partyRows)
        if (pErr) console.warn('Party insert error (non-fatal):', pErr.message)
      }

      toast.success(`"${remote.name}" imported!`)
      onClose()
      navigate(`/matters/${matter.id}`)
    } catch (err) {
      toast.error('Import failed: ' + (err.message || 'Unknown error'))
    } finally {
      setImporting(null)
    }
  }

  const meta = PROVIDER_META[provider] ?? PROVIDER_META.clio

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Import Matter</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Select a matter from your practice management system
            </p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        {/* Provider tabs */}
        {availableProviders.length > 1 && (
          <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
            {availableProviders.map(p => (
              <button
                key={p}
                onClick={() => { setProvider(p); setSearch('') }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  provider === p
                    ? `${PROVIDER_META[p].bg} ${PROVIDER_META[p].color} ${PROVIDER_META[p].border} border`
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {PROVIDER_META[p].label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-4 pb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="form-input pl-9 pr-10"
              placeholder={`Search ${meta.label} matters…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Matter list */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="font-medium text-slate-700">Could not load matters</p>
              <p className="text-sm text-slate-500 max-w-sm">{error.message}</p>
              <button onClick={() => refetch()} className="btn-secondary text-sm">
                <RefreshCcw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : isLoading && remoteMatters.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-14 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Fetching matters from {meta.label}…</span>
            </div>
          ) : remoteMatters.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Download className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No matters found{search ? ` matching "${search}"` : ''}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {remoteMatters.map(m => {
                const alreadyImported = existingExternalIds.has(m.external_id)
                const isImporting     = importing === m.external_id
                return (
                  <div
                    key={m.external_id}
                    className={`rounded-xl border p-4 transition-colors ${
                      alreadyImported
                        ? 'border-slate-100 bg-slate-50'
                        : 'border-slate-200 hover:border-brand-200 hover:bg-brand-50/30 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-medium truncate ${alreadyImported ? 'text-slate-400' : 'text-slate-800'}`}>
                            {m.name}
                          </p>
                          {m.matter_number && (
                            <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                              #{m.matter_number}
                            </span>
                          )}
                          <span className={`badge text-xs flex-shrink-0 ${statusColor(m.status)}`}>
                            {m.status}
                          </span>
                          {alreadyImported && (
                            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                              <CheckCircle2 className="h-3 w-3" /> Already imported
                            </span>
                          )}
                        </div>
                        {m.parties.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Users className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            <p className="text-xs text-slate-500 truncate">
                              {m.parties.slice(0, 3).map(p => p.name).join(', ')}
                              {m.parties.length > 3 ? ` +${m.parties.length - 3} more` : ''}
                            </p>
                          </div>
                        )}
                      </div>

                      {alreadyImported ? (
                        <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">Imported</span>
                      ) : (
                        <button
                          onClick={() => importMatter(m)}
                          disabled={isImporting}
                          className="btn-primary text-sm py-1.5 px-3 flex-shrink-0"
                        >
                          {isImporting
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</>
                            : <><Download className="h-3.5 w-3.5" /> Import</>}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3 flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {remoteMatters.length > 0 && !isLoading
              ? `${remoteMatters.length} matter${remoteMatters.length !== 1 ? 's' : ''} from ${meta.label}`
              : `Showing matters from ${meta.label}`}
          </p>
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}
