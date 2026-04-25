/**
 * LexAlloc Audit Log
 *
 * logAudit() is fire-and-forget — it never throws or blocks the
 * calling operation. A failure to log should never break real work.
 *
 * Usage:
 *   import { logAudit } from '../lib/audit.js'
 *   logAudit({ profile, matterId, action: 'party.added', entityType: 'party',
 *               entityId: party.id, entityName: party.name,
 *               metadata: { share_percentage: 25 } })
 */

import { supabase } from './supabase.js'

/**
 * @param {Object} opts
 * @param {Object}  opts.profile      - useAuth() profile (provides org_id, id, email, name)
 * @param {string}  [opts.matterId]   - UUID of the matter (null for org-level events)
 * @param {string}  opts.action       - dot-notation action key, e.g. 'party.percentage_changed'
 * @param {string}  [opts.entityType] - 'matter'|'party'|'insurer'|'invoice'|'apportionment'|'payment'|'demand_letter'|'document'
 * @param {string}  [opts.entityId]   - UUID of the affected row
 * @param {string}  [opts.entityName] - Human-readable label at time of action
 * @param {Object}  [opts.metadata]   - Extra context (old/new values, amounts, etc.)
 */
export async function logAudit({
  profile,
  matterId   = null,
  action,
  entityType = null,
  entityId   = null,
  entityName = null,
  metadata   = {},
}) {
  if (!profile?.org_id || !action) return  // silently skip if context missing

  try {
    await supabase.from('la_audit_logs').insert({
      org_id:      profile.org_id,
      matter_id:   matterId   || null,
      user_id:     profile.id || null,
      user_email:  profile.email || null,
      user_name:   [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || null,
      action,
      entity_type: entityType || null,
      entity_id:   entityId   || null,
      entity_name: entityName || null,
      metadata,
    })
  } catch {
    // Swallow — audit log failure must never break primary operations
  }
}

// ── Display metadata ──────────────────────────────────────────────────────────
// Maps action keys → { label, icon name, color classes }
// Icon names correspond to lucide-react exports used in the Activity tab.

export const ACTION_META = {
  // Matter
  'matter.created':            { label: 'Matter created',             icon: 'Briefcase',   color: 'text-brand-600 bg-brand-50'   },
  'matter.status_changed':     { label: 'Status changed',             icon: 'Briefcase',   color: 'text-slate-600 bg-slate-100'  },
  'matter.updated':            { label: 'Matter updated',             icon: 'Briefcase',   color: 'text-slate-600 bg-slate-100'  },
  // Parties
  'party.added':               { label: 'Party added',                icon: 'Users',       color: 'text-indigo-600 bg-indigo-50' },
  'party.deleted':             { label: 'Party removed',              icon: 'Users',       color: 'text-red-600 bg-red-50'       },
  'party.percentage_changed':  { label: 'Share % changed',            icon: 'Users',       color: 'text-amber-600 bg-amber-50'   },
  'party.shares_equalized':    { label: 'Shares equalized',           icon: 'Users',       color: 'text-amber-600 bg-amber-50'   },
  'party.remainder_split':     { label: 'Remainder split',            icon: 'Users',       color: 'text-amber-600 bg-amber-50'   },
  // Insurers
  'insurer.added':             { label: 'Insurer added',              icon: 'Shield',      color: 'text-sky-600 bg-sky-50'       },
  'insurer.updated':           { label: 'Policy period updated',      icon: 'Shield',      color: 'text-sky-600 bg-sky-50'       },
  'insurer.deleted':           { label: 'Insurer removed',            icon: 'Shield',      color: 'text-red-600 bg-red-50'       },
  // Invoices
  'invoice.uploaded':          { label: 'Invoice uploaded',           icon: 'FileText',    color: 'text-violet-600 bg-violet-50' },
  'invoice.parsed':            { label: 'Invoice parsed',             icon: 'FileText',    color: 'text-violet-600 bg-violet-50' },
  // Apportionments
  'apportionment.calculated':  { label: 'Apportionment calculated',   icon: 'Calculator',  color: 'text-emerald-600 bg-emerald-50'},
  // Payments
  'payment.updated':           { label: 'Payment status updated',     icon: 'DollarSign',  color: 'text-green-600 bg-green-50'   },
  // Demand letters
  'demand_letter.generated':   { label: 'Demand letter generated',    icon: 'Mail',        color: 'text-orange-600 bg-orange-50' },
  // Documents
  'document.uploaded':         { label: 'Document uploaded',          icon: 'Paperclip',   color: 'text-teal-600 bg-teal-50'     },
  'document.deleted':          { label: 'Document deleted',           icon: 'Paperclip',   color: 'text-red-600 bg-red-50'       },
}

export function getActionMeta(action) {
  return ACTION_META[action] ?? { label: action, icon: 'Activity', color: 'text-slate-600 bg-slate-100' }
}
