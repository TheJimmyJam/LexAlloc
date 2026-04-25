// Railway backend API client (used for invoice parsing + invitations)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

async function request(path, options = {}) {
  const { data: { session } } = await import('./supabase.js').then(m => m.supabase.auth.getSession())
  const token = session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Invoice parsing (Supabase Edge Function)
  parseInvoice: (fileUrl, mimeType) =>
    request('/api/invoices/parse', {
      method: 'POST',
      body: JSON.stringify({ fileUrl, mimeType }),
    }),

  // Apportionment calculation
  calculateApportionment: (payload) =>
    request('/api/apportionments/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Invite a user — calls the Supabase Edge Function so it works without
  // VITE_API_URL being configured (Railway not required for invites).
  inviteUser: async (email, role, orgId) => {
    const { supabase } = await import('./supabase.js')
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, role, org_id: orgId },
    })
    if (error) throw new Error(error.message || 'Invite failed')
    if (data?.error) throw new Error(data.error)
    return data
  },

  // ── Billing ────────────────────────────────────────────────────────────────
  getSubscription: () =>
    request('/api/billing/subscription'),

  createCheckoutSession: ({ plan, seats, interval }) =>
    request('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, seats, interval }),
    }),

  createPortalSession: () =>
    request('/api/billing/portal', { method: 'POST' }),

  // Fire a typed notification event via Supabase Edge Function.
  // type: 'invoice_parsed' | 'apportionment_run' | 'demand_letter_generated' | 'payment_status_updated'
  sendEvent: async (type, orgId, matterId, details = {}) => {
    const { supabase } = await import('./supabase.js')
    const { error } = await supabase.functions.invoke('send-notification', {
      body: { type, org_id: orgId, matter_id: matterId, details },
    })
    if (error) throw error
  },
}
