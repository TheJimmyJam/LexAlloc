// generateApportionmentReport.js
// Generates a full apportionment audit-trail PDF using jsPDF + jspdf-autotable.
// Usage:
//   import { generateApportionmentReport } from './generateApportionmentReport.js'
//   generateApportionmentReport(apport)   // triggers download

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'

// ── Brand colors ──────────────────────────────────────────────────────────────
const BRAND   = [79,  70, 229]   // #4f46e5 indigo
const DARK    = [15,  23, 42]    // #0f172a slate-900
const MID     = [71,  85, 105]   // #475569 slate-600
const LIGHT   = [241, 245, 249]  // #f1f5f9 slate-100
const WHITE   = [255, 255, 255]
const GREEN   = [22,  163, 74]   // #16a34a
const AMBER   = [180, 83,  9]    // #b45309
const RED     = [185, 28,  28]   // #b91c1c
const BLUE    = [29,  78, 216]   // #1d4ed8

const METHODS = {
  pro_rata_time_on_risk: 'Pro-Rata Time-on-Risk',
  equal_shares:          'Equal Shares',
  limits_proportional:   'Limits-Proportional',
}

const PAY_LABELS = {
  pending:        'Pending',
  demanded:       'Demanded',
  paid:           'Paid',
  partially_paid: 'Partial',
  disputed:       'Disputed',
}

function fmtCur(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v || 0)
}
function fmtPct(v) { return `${(v || 0).toFixed(2)}%` }
function fmtDate(d) { return d ? format(parseISO(d), 'MM/dd/yyyy') : '—' }

// ── Page header/footer drawn on every page ────────────────────────────────────
function addPageChrome(doc, matterName, pageCount) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const pg = doc.internal.getCurrentPageInfo().pageNumber

  // Top bar
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...WHITE)
  doc.text('LexAlloc', 10, 6.8)
  doc.setFont('helvetica', 'normal')
  doc.text('Apportionment Report  ·  CONFIDENTIAL — ATTORNEY WORK PRODUCT', W / 2, 6.8, { align: 'center' })
  doc.text(`Page ${pg}${pageCount ? ` of ${pageCount}` : ''}`, W - 10, 6.8, { align: 'right' })

  // Bottom bar
  doc.setFillColor(...LIGHT)
  doc.rect(0, H - 8, W, 8, 'F')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(...MID)
  doc.text(matterName || '', 10, H - 3)
  doc.text(`Generated ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, W - 10, H - 3, { align: 'right' })
}

// ── Section heading ───────────────────────────────────────────────────────────
function sectionHeading(doc, y, text) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...LIGHT)
  doc.rect(10, y, W - 20, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...BRAND)
  doc.text(text.toUpperCase(), 14, y + 5)
  return y + 10
}

// ── Two-column key/value grid ─────────────────────────────────────────────────
function kvGrid(doc, y, pairs) {
  const colW = 90
  const rowH  = 7
  let col = 0, row = 0
  doc.setFontSize(8)
  pairs.forEach(([label, value]) => {
    const x = 10 + col * colW
    const ly = y + row * rowH
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MID)
    doc.text(label, x, ly)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(String(value ?? '—'), x + 36, ly)
    col++
    if (col > 1) { col = 0; row++ }
  })
  return y + (Math.ceil(pairs.length / 2)) * rowH + 4
}

// ── Payment status cell color ─────────────────────────────────────────────────
function payColor(status) {
  switch (status) {
    case 'paid':           return GREEN
    case 'partially_paid': return BLUE
    case 'demanded':       return AMBER
    case 'disputed':       return RED
    default:               return MID
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generateApportionmentReport(apport) {
  const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const W        = doc.internal.pageSize.getWidth()
  const invoice  = apport.invoices || {}
  const matter   = apport.matters  || {}
  const partyApps = apport.party_apportionments || []
  const calcMethod = apport.calculation_method || 'pro_rata_time_on_risk'
  const isTOR    = calcMethod === 'pro_rata_time_on_risk'
  const isLimits = calcMethod === 'limits_proportional'
  const matterName = matter.name || 'Unknown Matter'

  // ── Cover Page ──────────────────────────────────────────────────────────────
  // Hero bar
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 48, 'F')

  // Logo mark
  doc.setFillColor(255, 255, 255, 0.15)
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...BRAND)
  doc.roundedRect(10, 12, 18, 18, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND)
  doc.text('LA', 19, 23.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...WHITE)
  doc.text('LexAlloc', 32, 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180, 185, 230)
  doc.text('Legal Invoice Apportionment Platform', 32, 29)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...WHITE)
  doc.text('Apportionment Report', 10, 41)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 205, 245)
  doc.text('CONFIDENTIAL — ATTORNEY WORK PRODUCT', W - 10, 41, { align: 'right' })

  // Matter + invoice summary
  let y = 58
  y = kvGrid(doc, y, [
    ['Matter',            matterName + (matter.matter_number ? ` (${matter.matter_number})` : '')],
    ['Invoice #',         invoice.invoice_number || '—'],
    ['Billing Firm',      invoice.billing_firm || '—'],
    ['Invoice Total',     fmtCur(invoice.total_amount)],
    ['Service Start',     fmtDate(invoice.service_start)],
    ['Service End',       fmtDate(invoice.service_end || invoice.service_start)],
    ['Calculation Method',METHODS[calcMethod] || calcMethod],
    ['Calculated At',     apport.calculated_at ? format(parseISO(apport.calculated_at), 'MMM d, yyyy h:mm a') : '—'],
    ['Notes',             apport.notes || '—'],
    ['Report Generated',  format(new Date(), 'MMM d, yyyy h:mm a')],
  ])

  // Divider
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.5)
  doc.line(10, y, W - 10, y)
  y += 6

  // ── Section 1: Party Summary ────────────────────────────────────────────────
  y = sectionHeading(doc, y, '1. Party Apportionment Summary')

  const partySummaryRows = partyApps.map(pa => [
    pa.parties?.name || '—',
    pa.parties?.type?.replace(/_/g, ' ') || '—',
    fmtPct(pa.percentage),
    fmtCur(pa.amount),
    String((pa.insurer_apportionments || []).length),
  ])
  const totalPaid = partyApps.reduce((s, pa) =>
    s + (pa.insurer_apportionments || []).reduce((s2, ia) => s2 + (ia.amount_paid || 0), 0), 0)
  const totalOwed = partyApps.reduce((s, pa) => s + (pa.amount || 0), 0)
  partySummaryRows.push(['', '', 'TOTAL', fmtCur(totalOwed), ''])

  autoTable(doc, {
    startY: y,
    margin: { left: 10, right: 10 },
    head: [['Party', 'Type', 'Share %', 'Amount', 'Insurers']],
    body: partySummaryRows,
    styles:     { fontSize: 8, cellPadding: 2.5, textColor: DARK },
    headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 35 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 18, halign: 'center' },
    },
    didParseCell(data) {
      // Bold the total row
      if (data.row.index === partySummaryRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = LIGHT
      }
    },
  })

  // ── Section 2: Insurer Obligations per Party ────────────────────────────────
  y = doc.lastAutoTable.finalY + 8
  y = sectionHeading(doc, y, '2. Insurer Obligations by Party')
  y += 2

  for (const pa of partyApps) {
    const ias = pa.insurer_apportionments || []
    if (ias.length === 0) continue

    // Party sub-header
    if (y > 240) { doc.addPage(); y = 18 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)
    doc.text(`${pa.parties?.name || 'Unknown'} — ${fmtPct(pa.percentage)} share (${fmtCur(pa.amount)})`, 10, y)
    y += 5

    // Build columns based on method
    const head = isTOR
      ? [['Insurer', 'Policy #', 'Policy Period', 'Days\non Risk', 'TOR %', 'Obligated', 'Paid', 'Balance', 'Status']]
      : isLimits
      ? [['Insurer', 'Policy #', 'Policy Limit', 'Limit %', 'Obligated', 'Paid', 'Balance', 'Status']]
      : [['Insurer', 'Policy #', 'Policy Period', 'Equal %', 'Obligated', 'Paid', 'Balance', 'Status']]

    const body = ias.map(ia => {
      const pp      = ia.insurer_policy_periods || {}
      const balance = (ia.amount || 0) - (ia.amount_paid || 0)
      const torDays = ia.days_on_risk != null && ia.total_days != null
        ? `${ia.days_on_risk} / ${ia.total_days}`
        : '—'
      const period  = (pp.policy_start && pp.policy_end)
        ? `${fmtDate(pp.policy_start)} –\n${fmtDate(pp.policy_end)}`
        : '—'

      if (isTOR) return [
        ia.insurers?.name || '—',
        ia.insurers?.policy_number || pp.claim_number || '—',
        period,
        torDays,
        fmtPct(ia.percentage),
        fmtCur(ia.amount),
        fmtCur(ia.amount_paid),
        fmtCur(balance),
        PAY_LABELS[ia.payment_status] || '—',
      ]
      if (isLimits) return [
        ia.insurers?.name || '—',
        ia.insurers?.policy_number || '—',
        pp.policy_limit ? fmtCur(pp.policy_limit) : '—',
        fmtPct(ia.percentage),
        fmtCur(ia.amount),
        fmtCur(ia.amount_paid),
        fmtCur(balance),
        PAY_LABELS[ia.payment_status] || '—',
      ]
      // equal shares
      return [
        ia.insurers?.name || '—',
        ia.insurers?.policy_number || '—',
        period,
        fmtPct(ia.percentage),
        fmtCur(ia.amount),
        fmtCur(ia.amount_paid),
        fmtCur(balance),
        PAY_LABELS[ia.payment_status] || '—',
      ]
    })

    // Party subtotal row
    const subOwed = ias.reduce((s, ia) => s + (ia.amount || 0), 0)
    const subPaid = ias.reduce((s, ia) => s + (ia.amount_paid || 0), 0)
    if (isTOR)    body.push(['Subtotal', '', '', '', '', fmtCur(subOwed), fmtCur(subPaid), fmtCur(subOwed - subPaid), ''])
    else if (isLimits) body.push(['Subtotal', '', '', '', fmtCur(subOwed), fmtCur(subPaid), fmtCur(subOwed - subPaid), ''])
    else          body.push(['Subtotal', '', '', '', fmtCur(subOwed), fmtCur(subPaid), fmtCur(subOwed - subPaid), ''])

    const colStylesTOR = {
      0: { cellWidth: 38 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 },
      3: { cellWidth: 16, halign: 'center' }, 4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' }, 8: { cellWidth: 18, halign: 'center' },
    }
    const colStylesOther = {
      0: { cellWidth: 44 }, 1: { cellWidth: 26 }, 2: { cellWidth: 28 },
      3: { cellWidth: 16, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' }, 6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 18, halign: 'center' },
    }

    autoTable(doc, {
      startY: y,
      margin: { left: 10, right: 10 },
      head,
      body,
      styles:     { fontSize: 7.5, cellPadding: 2, textColor: DARK },
      headStyles: { fillColor: [55, 48, 163], textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: isTOR ? colStylesTOR : colStylesOther,
      didParseCell(data) {
        const isSubtotal = data.row.index === body.length - 1
        if (isSubtotal) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = LIGHT
        }
        // Color payment status
        const statusCol = isTOR ? 8 : 7
        if (data.column.index === statusCol && data.section === 'body' && !isSubtotal) {
          const row = ias[data.row.index]
          if (row) data.cell.styles.textColor = payColor(row.payment_status)
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Section 3: Payment Status Summary ──────────────────────────────────────
  if (y > 210) { doc.addPage(); y = 18 }
  y = sectionHeading(doc, y, '3. Payment Status Summary')

  const allObligations = partyApps.flatMap(pa =>
    (pa.insurer_apportionments || []).map(ia => ({
      insurer:  ia.insurers?.name || '—',
      party:    pa.parties?.name  || '—',
      claim:    ia.insurer_policy_periods?.claim_number || '—',
      rep:      ia.insurer_policy_periods?.claims_rep_name || '—',
      owed:     ia.amount       || 0,
      paid:     ia.amount_paid  || 0,
      balance:  (ia.amount || 0) - (ia.amount_paid || 0),
      status:   ia.payment_status,
      payDate:  ia.payment_date ? fmtDate(ia.payment_date) : '—',
    }))
  )

  const payBody = allObligations.map(o => [
    o.insurer, o.party, o.claim, fmtCur(o.owed), fmtCur(o.paid), fmtCur(o.balance),
    PAY_LABELS[o.status] || '—', o.payDate,
  ])
  const grandOwed    = allObligations.reduce((s, o) => s + o.owed, 0)
  const grandPaid    = allObligations.reduce((s, o) => s + o.paid, 0)
  const grandBalance = grandOwed - grandPaid
  payBody.push(['TOTAL', '', '', fmtCur(grandOwed), fmtCur(grandPaid), fmtCur(grandBalance), '', ''])

  autoTable(doc, {
    startY: y,
    margin: { left: 10, right: 10 },
    head: [['Insurer', 'Party', 'Claim #', 'Obligated', 'Paid', 'Balance', 'Status', 'Pay Date']],
    body: payBody,
    styles:     { fontSize: 7.5, cellPadding: 2, textColor: DARK },
    headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 38 }, 1: { cellWidth: 32 }, 2: { cellWidth: 24 },
      3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 18, halign: 'center' }, 7: { cellWidth: 20, halign: 'center' },
    },
    didParseCell(data) {
      const isTotalRow = data.row.index === payBody.length - 1
      if (isTotalRow) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = LIGHT
      }
      if (data.column.index === 6 && data.section === 'body' && !isTotalRow) {
        const row = allObligations[data.row.index]
        if (row) data.cell.styles.textColor = payColor(row.status)
      }
    },
  })

  // ── Section 4: Audit Trail ──────────────────────────────────────────────────
  y = doc.lastAutoTable.finalY + 8
  if (y > 230) { doc.addPage(); y = 18 }
  y = sectionHeading(doc, y, '4. Calculation Audit Trail')

  const methodDescriptions = {
    pro_rata_time_on_risk: 'Each insurer\'s share was calculated based on the number of calendar days their policy was in force during the invoice service period, divided by the total service period length. Insurers with no policy overlap received a 0% allocation.',
    equal_shares:          'Each insurer assigned to a party received an equal percentage share of that party\'s obligation, regardless of policy dates or limits.',
    limits_proportional:   'Each insurer\'s share was weighted by their policy limit as a proportion of the total limits across all insurers for that party. Insurers with no configured limit fell back to equal shares.',
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MID)
  const methodDesc = methodDescriptions[calcMethod] || ''
  const lines = doc.splitTextToSize(methodDesc, W - 20)
  doc.text(lines, 10, y)
  y += lines.length * 4.5 + 5

  autoTable(doc, {
    startY: y,
    margin: { left: 10, right: 10 },
    head: [['Field', 'Value']],
    body: [
      ['Apportionment ID',  apport.id || '—'],
      ['Matter',            matterName + (matter.matter_number ? ` (${matter.matter_number})` : '')],
      ['Invoice #',         invoice.invoice_number || '—'],
      ['Invoice Date',      fmtDate(invoice.invoice_date)],
      ['Service Period',    `${fmtDate(invoice.service_start)} – ${fmtDate(invoice.service_end || invoice.service_start)}`],
      ['Invoice Total',     fmtCur(invoice.total_amount)],
      ['Calculation Method',METHODS[calcMethod] || calcMethod],
      ['Calculated At',     apport.calculated_at ? format(parseISO(apport.calculated_at), 'MMMM d, yyyy h:mm:ss a') : '—'],
      ['Notes',             apport.notes || '—'],
      ['Report Generated',  format(new Date(), 'MMMM d, yyyy h:mm:ss a')],
      ['Total Parties',     String(partyApps.length)],
      ['Total Insurers',    String(partyApps.reduce((s, pa) => s + (pa.insurer_apportionments?.length || 0), 0))],
      ['Total Obligated',   fmtCur(grandOwed)],
      ['Total Paid',        fmtCur(grandPaid)],
      ['Outstanding Balance', fmtCur(grandBalance)],
    ],
    styles:     { fontSize: 8, cellPadding: 2.5, textColor: DARK },
    headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold', textColor: MID },
      1: { cellWidth: 120 },
    },
  })

  // ── Add chrome to every page ─────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addPageChrome(doc, matterName, totalPages)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const matterSlug  = matterName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const invNum      = (invoice.invoice_number || 'inv').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const dateStamp   = format(new Date(), 'yyyy-MM-dd')
  doc.save(`LexAlloc_Apportionment_${matterSlug}_${invNum}_${dateStamp}.pdf`)
}
