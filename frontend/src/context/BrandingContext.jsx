import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Domains that are "native" LexAlloc — no custom branding lookup needed
const LEXALLOC_DOMAINS = ['lexalloc.com', 'lexalloc.netlify.app', 'localhost', '127.0.0.1']

const BrandingContext = createContext({
  brandName:      null,
  logoUrl:        null,
  primaryColor:   null,
  faviconUrl:     null,
  supportEmail:   null,
  isWhiteLabeled: false,
  orgId:          null,
  loaded:         false,
})

// ── Color palette generator ───────────────────────────────────────────────────
// Given a single hex "primary" color (mapped to shade 600), generate the full
// 50–900 palette by manipulating HSL lightness so Tailwind brand-* classes
// all resolve to the correct hue family.

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255
  let g = parseInt(hex.slice(3, 5), 16) / 255
  let b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2
  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      default: h = ((r - g) / d + 4) / 6
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h, s, l) {
  const ls = l / 100
  const ss = s / 100
  const a  = ss * Math.min(ls, 1 - ls)
  const f  = n => {
    const k     = (n + h / 30) % 12
    const color = ls - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function generatePalette(hex) {
  const [h, s] = hexToHsl(hex)
  return {
    50:  hslToHex(h, Math.min(s, 50),  97),
    100: hslToHex(h, Math.min(s, 60),  94),
    200: hslToHex(h, Math.min(s, 70),  88),
    300: hslToHex(h, Math.min(s, 75),  78),
    400: hslToHex(h, Math.min(s, 80),  66),
    500: hslToHex(h, s,                56),
    600: hex,                              // caller's primary IS shade 600
    700: hslToHex(h, s,                42),
    800: hslToHex(h, s,                33),
    900: hslToHex(h, s,                26),
  }
}

function applyPalette(hex) {
  const palette = generatePalette(hex)
  const root    = document.documentElement
  Object.entries(palette).forEach(([shade, color]) => {
    root.style.setProperty(`--brand-${shade}`, color)
  })
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState({ loaded: false, isWhiteLabeled: false })

  useEffect(() => {
    const hostname  = window.location.hostname
    const isDefault = LEXALLOC_DOMAINS.some(
      d => hostname === d || hostname.endsWith('.' + d)
    )

    if (isDefault) {
      setBranding({ loaded: true, isWhiteLabeled: false })
      return
    }

    // Custom domain — query the public branding view (anon key, no auth needed)
    supabase
      .from('la_org_branding_public')
      .select('*')
      .eq('custom_domain', hostname)
      .single()
      .then(({ data }) => {
        if (!data) {
          setBranding({ loaded: true, isWhiteLabeled: false })
          return
        }

        // Apply brand color palette to CSS custom properties
        if (data.brand_primary_color) {
          applyPalette(data.brand_primary_color)
        }

        // Swap favicon
        if (data.brand_favicon_url) {
          let link = document.querySelector("link[rel~='icon']")
          if (!link) {
            link     = document.createElement('link')
            link.rel = 'icon'
            document.head.appendChild(link)
          }
          link.href = data.brand_favicon_url
        }

        // Update page title
        if (data.brand_name) {
          document.title = data.brand_name
        }

        setBranding({
          loaded:         true,
          isWhiteLabeled: true,
          orgId:          data.org_id,
          brandName:      data.brand_name      || null,
          logoUrl:        data.brand_logo_url  || null,
          primaryColor:   data.brand_primary_color || null,
          faviconUrl:     data.brand_favicon_url   || null,
          supportEmail:   data.brand_support_email || null,
        })
      })
  }, [])

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}

// Exported so AdminPanel can trigger a live preview without a full remount
export { applyPalette }
