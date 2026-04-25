/**
 * apiAuth.js — API key authentication middleware for /v1/* routes
 *
 * Expects:  Authorization: Bearer lx_live_<hex>
 * On success: sets req.orgId, req.apiKey (the DB row), req.apiScopes
 * On failure: 401 JSON
 */

import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export function apiKeyAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer lx_')) {
    return res.status(401).json({
      error:   'Unauthorized',
      message: 'Include your API key as: Authorization: Bearer lx_live_...',
    })
  }

  const rawKey = auth.slice(7)   // strip "Bearer "
  const hash   = createHash('sha256').update(rawKey).digest('hex')

  supabaseAdmin
    .from('la_api_keys')
    .select('id, org_id, name, scopes, is_active, expires_at')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single()
    .then(({ data: key, error }) => {
      if (error || !key) {
        return res.status(401).json({ error: 'Invalid or revoked API key' })
      }
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        return res.status(401).json({ error: 'API key has expired' })
      }

      // Fire-and-forget last_used_at update
      supabaseAdmin
        .from('la_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', key.id)
        .then(() => {})

      req.orgId     = key.org_id
      req.apiKey    = key
      req.apiScopes = key.scopes || ['read']
      next()
    })
    .catch(err => {
      console.error('apiKeyAuth error', err)
      res.status(500).json({ error: 'Internal server error' })
    })
}

/** Require a specific scope — use after apiKeyAuth */
export function requireScope(scope) {
  return (req, res, next) => {
    const scopes = req.apiScopes || []
    if (scopes.includes(scope) || scopes.includes('write') || scopes.includes('admin')) {
      return next()
    }
    // 'write' implies write:invoices; 'read' covers all read scopes
    if (scope.startsWith('read') && scopes.includes('read')) return next()
    if (scope.startsWith('write') && scopes.includes('write')) return next()
    res.status(403).json({
      error:    'Forbidden',
      message:  `This endpoint requires the '${scope}' scope. Your key has: ${scopes.join(', ')}`,
    })
  }
}
