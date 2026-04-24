// Railway backend API client
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
  // Invoice parsing
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

  // Send email notification (generic)
  sendNotification: (payload) =>
    request('/api/notifications/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Fire a typed app event — resolves recipients + matter name on the backend
  // type: 'invoice_parsed' | 'apportionment_run' | 'demand_letter_generated' | 'payment_status_updated'
  sendEvent: (type, orgId, matterId, details = {}) =>
    request('/api/notifications/event', {
      method: 'POST',
      body: JSON.stringify({ type, org_id: orgId, matter_id: matterId, details }),
    }),

  // Invite a user to the organization
  inviteUser: (email, role, orgId) =>
    request('/api/invitations/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role, org_id: orgId }),
    }),
}
