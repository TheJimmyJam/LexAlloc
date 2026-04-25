/**
 * v1/index.js — Public REST API v1 router
 *
 * Base URL: /v1
 * Auth: Authorization: Bearer lx_live_<key>
 * Rate limit: 600 req / 10 min per API key
 *
 * Endpoints:
 *   GET  /v1/                           API info
 *   GET  /v1/matters                    List matters
 *   GET  /v1/matters/:id                Matter detail
 *   GET  /v1/matters/:id/parties        Parties on a matter
 *   GET  /v1/matters/:id/invoices       Invoices on a matter
 *   POST /v1/matters/:id/invoices       Push an invoice
 *   GET  /v1/matters/:id/apportionments Apportionments on a matter
 *   GET  /v1/apportionments/:id         Full apportionment result
 */

import { Router }     from 'express'
import rateLimit      from 'express-rate-limit'
import { apiKeyAuth } from '../../middleware/apiAuth.js'
import mattersRouter  from './matters.js'
import apportRouter   from './apportionments.js'

const router = Router()

// ── Rate limiting: 600 requests per 10 minutes per API key ───────────────────
const limiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             600,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.headers.authorization || req.ip,
  handler:         (req, res) => res.status(429).json({
    error:   'Rate limit exceeded',
    message: 'You can make up to 600 requests per 10 minutes.',
    retry_after: Math.ceil(req.rateLimit?.resetTime / 1000) || null,
  }),
})

// Apply auth + rate limiting to all v1 routes
router.use(apiKeyAuth)
router.use(limiter)

// ── Root — API info ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    api:      'LexAlloc REST API',
    version:  'v1',
    org_id:   req.orgId,
    key_name: req.apiKey?.name,
    scopes:   req.apiScopes,
    docs:     'https://docs.lexalloc.com/api',
    endpoints: {
      matters:         'GET  /v1/matters',
      matter_detail:   'GET  /v1/matters/:id',
      parties:         'GET  /v1/matters/:id/parties',
      invoices:        'GET  /v1/matters/:id/invoices',
      push_invoice:    'POST /v1/matters/:id/invoices',
      apportionments:  'GET  /v1/matters/:id/apportionments',
      apportionment:   'GET  /v1/apportionments/:id',
    },
  })
})

// ── Sub-routers ───────────────────────────────────────────────────────────────
router.use('/matters',        mattersRouter)
router.use('/apportionments', apportRouter)

export default router
