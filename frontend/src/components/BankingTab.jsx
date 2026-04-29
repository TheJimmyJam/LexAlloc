import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, ExternalLink, AlertCircle, CheckCircle2, Lock, Loader2,
  Building2, ArrowDownRight, ArrowUpRight, Info, Plug, RefreshCcw,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { confidenceBand } from '../lib/matchBankTransaction.js'
import { formatCurrency } from '../lib/calculations.js'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

// ============================================================
// Banking tab — provider-agnostic shell for the bank integration.
// Right now Mercury is the only provider with a planned full build;
// Plaid and manual entry are stubbed. The UI is intentionally
// honest about what's not wired yet so it's clear what ships now
// vs. when the org has an LLC + access token.
// ============================================================

const PROVIDERS = [
  {
    key:      'mercury',
    label:    'Mercury',
    blurb:    'Best fit. API-first, free accounts, sub-account-per-matter via Treasury. Wire-up will provision a child account each time you create a matter so insurers can wire directly into a dedicated bucket.',
    docsUrl:  'https://docs.mercury.com',
    enabled:  true,
    primary:  true,
  },
  {
    key:      'plaid',
    label:    'Plaid (read-only fallback)',
    blurb:    'For firms whose primary bank doesn\'t have a public API. Read-only — sees incoming transactions and runs the same matching engine, but cannot provision sub-accounts.',
    docsUrl:  'https://plaid.com/docs/',
    enabled:  false,
    primary:  false,
  },
  {
    key:      'manual',
    label:    'Manual entry',
    blurb:    'No connection at all. Paste a CSV of incoming wires/ACH credits or enter them by hand to reconcile against demand letters.',
    docsUrl:  null,
    enabled:  false,
    primary:  false,
  },
]


export default function BankingTab() {
  const { profile } = useAuth()
  const qc          = useQueryClient()
  const orgId       = profile?.org_id

  // ── Connection state ─────────────────────────────────────────────────────
  const { data: connections = [], isLoading: connLoading } = useQuery({
    queryKey: ['bank-connections', orgId],
    enabled:  !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('la_bank_connections')
        .select('*')
        .eq('org_id', orgId)
        .order('connected_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const mercuryConnection = connections.find(c => c.provider === 'mercury')
  const isConnected       = !!mercuryConnection && mercuryConnection.status === 'connected'

  // ── Recent transactions (will be empty until a connector lands) ───────────
  const { data: recentTxns = [], isLoading: txnLoading } = useQuery({
    queryKey: ['bank-transactions-recent', orgId],
    enabled:  !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_bank_transactions')
        .select(`
          id, posted_at, amount_cents, direction, currency,
          counterparty_name, description, raw_memo,
          match_method, match_confidence, matched_apportionment_id,
          la_insurer_apportionments:matched_apportionment_id(
            id, lexalloc_invoice_number,
            insurers:la_insurers(name),
            apportionment:la_apportionments(matter:la_matters(id, name))
          )
        `)
        .eq('org_id', orgId)
        .order('posted_at', { ascending: false })
        .limit(20)
      return data || []
    },
  })

  const unmatchedCount = recentTxns.filter(t => !t.matched_apportionment_id && t.direction === 'credit').length
  const matchedCount   = recentTxns.filter(t => !!t.matched_apportionment_id).length

  // ── Mercury connect flow (stub for now) ───────────────────────────────────
  // Real implementation will be a Supabase edge function that takes the
  // Mercury OAuth code, exchanges it for a long-lived token, encrypts it,
  // and writes a row into la_bank_connections. Until that exists we just
  // tell the user what's blocked.
  const [connecting, setConnecting] = useState(false)
  const handleConnectMercury = async () => {
    toast.error('Mercury connector ships next. We\'ve got the schema and matcher in place — needs an LLC + Mercury sandbox token to wire up the OAuth flow.')
  }

  return (
    <div className="space-y-6">

      {/* ── Header card ────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Banknote className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Banking &amp; Payment Reconciliation</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Connect a bank so incoming wires and ACH credits auto-match to demand letters. Mercury is the recommended provider — they support sub-account-per-matter, which means insurers can wire directly into a dedicated bucket for each case.
            </p>
          </div>
        </div>

        {/* Read-only badge */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm">
          <Lock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900">Read-only mode</p>
            <p className="text-xs text-amber-800 mt-0.5">
              LexAlloc never moves money on your behalf. We can read balances, fetch transactions, and (with Mercury) provision sub-accounts. ACH/wire transfers always go through your bank's UI with your explicit approval.
            </p>
          </div>
        </div>
      </div>

      {/* ── Provider list ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4">
        {PROVIDERS.map(p => {
          const conn = connections.find(c => c.provider === p.key)
          const status = conn
            ? conn.status
            : 'not_connected'
          return (
            <div key={p.key} className="card p-5">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p.primary ? 'bg-brand-100' : 'bg-slate-100'}`}>
                  <Building2 className={`h-5 w-5 ${p.primary ? 'text-brand-600' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-slate-900">{p.label}</h4>
                    {p.primary && <span className="badge bg-brand-100 text-brand-700 text-xs">Recommended</span>}
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{p.blurb}</p>
                  {p.docsUrl && (
                    <a href={p.docsUrl} target="_blank" rel="noreferrer"
                      className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1 mt-2">
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {p.key === 'mercury' && !isConnected && (
                    <button
                      onClick={handleConnectMercury}
                      disabled={connecting}
                      className="btn-primary"
                    >
                      {connecting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                        : <><Plug className="h-4 w-4" /> Connect Mercury</>
                      }
                    </button>
                  )}
                  {p.key === 'mercury' && isConnected && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> Connected
                    </span>
                  )}
                  {!p.enabled && (
                    <span className="text-xs text-slate-400">Coming next</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Recent transactions / reconciliation preview ────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-slate-900">Recent Transactions</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {connLoading || txnLoading
                ? 'Loading…'
                : recentTxns.length === 0
                ? 'No transactions yet — connect a bank to start matching.'
                : `${matchedCount} matched · ${unmatchedCount} need review`}
            </p>
          </div>
          {!!recentTxns.length && (
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['bank-transactions-recent', orgId] })}
              className="btn-secondary text-sm"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          )}
        </div>

        {recentTxns.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Banknote className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium text-slate-600 mb-1">No transactions imported yet</p>
            <p className="text-xs max-w-md mx-auto">
              Once you connect Mercury (or paste a CSV manually), incoming credits will appear here. The matching engine looks at amount, counterparty, date, and the LexAlloc invoice number in the wire memo to auto-pair payments with demand letters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Posted</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Counterparty</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Amount</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Match</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Apportionment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTxns.map(t => {
                  const band = confidenceBand(t.matched_apportionment_id ? t.match_confidence : null)
                  const ap = t.la_insurer_apportionments
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {t.posted_at ? format(parseISO(t.posted_at), 'MM/dd/yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[220px]">
                        <p className="truncate font-medium">{t.counterparty_name || '—'}</p>
                        {t.raw_memo && <p className="truncate text-xs text-slate-400 font-mono">{t.raw_memo}</p>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-semibold">
                        <span className={t.direction === 'credit' ? 'text-green-600' : 'text-slate-700'}>
                          {t.direction === 'credit'
                            ? <ArrowDownRight className="inline h-3 w-3 mr-0.5" />
                            : <ArrowUpRight className="inline h-3 w-3 mr-0.5" />}
                          {formatCurrency(t.amount_cents / 100)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge text-xs ${band.cls}`}>{band.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {ap ? (
                          <div className="text-xs">
                            <p className="font-mono text-slate-700 truncate max-w-[160px]">
                              {ap.lexalloc_invoice_number || '—'}
                            </p>
                            <p className="text-slate-400 truncate max-w-[200px]">
                              {ap.insurers?.name} · {ap.apportionment?.matter?.name}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── What's wired vs. what's pending ──────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-slate-500" />
          <h4 className="font-semibold text-slate-900 text-sm">Build status</h4>
        </div>
        <ul className="space-y-2 text-sm">
          {[
            { ok: true,  label: 'Schema',                   detail: 'la_bank_connections, la_bank_accounts, la_bank_transactions live in Supabase (RLS-gated by org).' },
            { ok: true,  label: 'Matching engine',          detail: 'Pure JS library. Strategies: exact LexAlloc invoice number in memo (100), amount + insurer + date (90), amount within rounding + insurer (75), amount + date (70), amount only (50).' },
            { ok: true,  label: 'Reconciliation UI shell',  detail: 'This page. Recent-transactions table renders matches with confidence bands once data lands.' },
            { ok: false, label: 'Mercury OAuth flow',       detail: 'Edge function — needs LLC + Mercury sandbox token to test against.' },
            { ok: false, label: 'Sub-account auto-create',  detail: 'Trigger on matter creation that hits the Mercury Treasury API to provision a child account and store its id on la_matters.bank_account_id.' },
            { ok: false, label: 'Webhook receiver',         detail: 'Edge function for Mercury\'s transaction-created webhook. Validates HMAC signature, runs matcher, inserts row, optionally marks the apportionment paid.' },
            { ok: false, label: 'Manual CSV import',        detail: 'Reconcile without a live bank connection — useful for firms staying off Mercury.' },
          ].map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              {s.ok
                ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${s.ok ? 'text-slate-800' : 'text-slate-500'}`}>{s.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}


function StatusBadge({ status }) {
  const map = {
    connected:    { label: 'Connected',    cls: 'bg-green-100 text-green-700' },
    pending:      { label: 'Pending',      cls: 'bg-amber-100 text-amber-700' },
    error:        { label: 'Error',        cls: 'bg-red-100 text-red-700' },
    disconnected: { label: 'Disconnected', cls: 'bg-slate-100 text-slate-600' },
    not_connected:{ label: 'Not connected',cls: 'bg-slate-100 text-slate-500' },
  }
  const s = map[status] || map.not_connected
  return <span className={`badge text-xs ${s.cls}`}>{s.label}</span>
}
