// generateMatterSummaryReport.js
// Produces a concise matter-level PDF: invoices processed, totals by party
// and insurer, payment status summary, and outstanding balances.
//
// Usage:
//   import { generateMatterSummaryReport } from './generateMatterSummaryReport.js'
//   generateMatterSummaryReport({ matter, parties, insurerPeriods, invoices, financialRows })

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, parseISO } from 'date-fns'

// ── Colors ────────────────────────────────────────────────────────────────────
const BRAND  = [79,  70, 229]
const DARK   = [15,  23,  42]
const MID    = [71,  85, 105]
const LIGHT  = [241, 245, 249]
const WHITE  = [255, 255, 255]
const GREEN  = [22,  163,  74]
const AMBER  = [180,  83,   9]
const RED    = [185,  28,  28]
const BLUE   = [29,   78, 216]
const PURPLE = [109,  40, 217]

const STATUS_COLORS = {
  pending:        MID,
  demanded:       AMBER,
  paid:           GREEN,
  partially_paid: BLUE,
  disputed:       RED,
}
const STATUS_LABELS = {
  pending: 'Pending', demanded: 'Demanded', paid: 'Paid',
  partially_paid: 'Partial', disputed: 'Disputed',
}
const INV_STATUS_COLORS = {
  draft: MID, parsed: BLUE, apportioned: PURPLE,
}

function fmtCur(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v || 0)
}
function fmtDate(d) { return d ? format(parseISO(d), 'MM/dd/yyyy') : '—' }
function cap(s)     { return s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—' }

// ── Per-page chrome ───────────────────────────────────────────────────────────
function chrome(doc, matterName, totalPages) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const pg = doc.internal.getCurrentPageInfo().pageNumber

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...WHITE)
  doc.text('LexAlloc', 10, 6.8)
  doc.setFont('helvetica', 'normal')
  doc.text('Matter Summary Report  ·  CONFIDENTIAL', W / 2, 6.8, { align: 'center' })
  doc.text(`Page ${pg} of ${totalPages}`, W - 10, 6.8, { align: 'right' })

  doc.setFillColor(...LIGHT)
  doc.rect(0, H - 8, W, 8, 'F')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(...MID)
  doc.text(matterName || '', 10, H - 3)
  doc.text(`Generated ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, W - 10, H - 3, { align: 'right' })
}

function sectionHead(doc, y, text, color = BRAND) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...LIGHT)
  doc.rect(10, y, W - 20, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...color)
  doc.text(text.toUpperCase(), 14, y + 5)
  return y + 10
}

function checkPage(doc, y, needed = 30) {
  if (y + needed > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage()
    return 18
  }
  return y
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generateMatterSummaryReport({ matter, parties, insurerPeriods, invoices, financialRows }) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const W    = doc.internal.pageSize.getWidth()
  const name = matter?.name || 'Unknown Matter'

  // ── Aggregate financials from all apportionments ──────────────────────────
  // by insurer: sum obligated, sum paid, collect statuses
  const byInsurer = {}   // { insurerId: { name, policyNumber, parties: Set, obligated, paid, statuses: [] } }
  const byParty   = {}   // { partyId: { name, obligated, paid } }

  for (const row of (financialRows || [])) {
    for (const pa of (row.party_apportionments || [])) {
      const pName = pa.parties?.name || '—'
      const pId   = pa.id
      if (!byParty[pId]) byParty[pId] = { name: pName, obligated: 0, paid: 0 }
      for (const ia of (pa.insurer_apportionments || [])) {
        byParty[pId].obligated += ia.amount       || 0
        byParty[pId].paid      += ia.amount_paid  || 0

        const iId = ia.insurers?.id || ia.insurers?.name || 'unknown'
        if (!byInsurer[iId]) {
          byInsurer[iId] = {
            name:         ia.insurers?.name        || '—',
            policyNumber: ia.insurers?.policy_number || '—',
            parties:      new Set(),
            obligated:    0,
            paid:         0,
            statuses:     [],
          }
        }
        byInsurer[iId].parties.add(pName)
        byInsurer[iId].obligated += ia.amount       || 0
        byInsurer[iId].paid      += ia.amount_paid  || 0
        if (ia.payment_status) byInsurer[iId].statuses.push(ia.payment_status)
      }
    }
  }

  // Derive rolled-up payment status per insurer
  const resolveStatus = (statuses) => {
    if (!statuses.length) return 'pending'
    if (statuses.every(s => s === 'paid')) return 'paid'
    if (statuses.some(s => s === 'disputed')) return 'disputed'
    if (statuses.some(s => s === 'paid') || statuses.some(s => s === 'partially_paid')) return 'partially_paid'
    if (statuses.some(s => s === 'demanded')) return 'demanded'
    return 'pending'
  }

  const insurerRows = Object.values(byInsurer).map(i => ({
    ...i,
    parties:  Array.from(i.parties).join(', '),
    balance:  i.obligated - i.paid,
    status:   resolveStatus(i.statuses),
  })).sort((a, b) => b.obligated - a.obligated)

  const partyRows = Object.values(byParty).sort((a, b) => b.obligated - a.obligated)

  const totalInvoiced  = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
  const totalObligated = insurerRows.reduce((s, r) => s + r.obligated, 0)
  const totalPaid      = insurerRows.reduce((s, r) => s + r.paid, 0)
  const totalBalance   = totalObligated - totalPaid

  // ── Cover hero ─────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 44, 'F')

  // Logo mark
  doc.setFillColor(...WHITE)
  doc.roundedRect(10, 11, 18, 18, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND)
  doc.text('LA', 19, 22.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...WHITE)
  doc.text('LexAlloc', 32, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180, 185, 230)
  doc.text('Matter Summary Report', 32, 28)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...WHITE)
  doc.text(name, 10, 38, { maxWidth: W - 80 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 205, 245)
  if (matter?.matter_number) doc.text(`Matter No. ${matter.matter_number}`, W - 10, 38, { align: 'right' })

  // ── KPI tiles ──────────────────────────────────────────────────────────────
  let y = 52
  const tiles = [
    { label: 'Total Invoiced',  value: fmtCur(totalInvoiced),  color: BRAND  },
    { label: 'Total Obligated', value: fmtCur(totalObligated), color: PURPLE },
    { label: 'Total Paid',      value: fmtCur(totalPaid),      color: GREEN  },
    { label: 'Balance Due',     value: fmtCur(totalBalance),   color: totalBalance > 0 ? RED : GREEN },
  ]
  const tileW = (W - 20 - 9) / 4
  tiles.forEach((t, i) => {
    const tx = 10 + i * (tileW + 3)
    doc.setFillColor(...LIGHT)
    doc.roundedRect(tx, y, tileW, 16, 2, 2, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...MID)
    doc.text(t.label, tx + tileW / 2, y + 5.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...t.color)
    doc.text(t.value, tx + tileW / 2, y + 12, { align: 'center' })
  })
  y += 22

  // More meta
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...MID)
  const metaItems = [
    `Status: ${cap(matter?.status)}`,
    `Parties: ${parties.length}`,
    `Insurers: ${insurerRows.length}`,
    `Invoices: ${invoices.length}`,
    `Apportionments: ${(financialRows || []).length}`,
    `Report Date: ${format(new Date(), 'MMMM d, yyyy')}`,
  ]
  doc.text(metaItems.join('   ·   '), W / 2, y, { align: 'center' })
  y += 6

  if (matter?.description) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...MID)
    const descLines = doc.splitTextToSize(matter.description, W - 20)
    doc.text(descLines, 10, y)
    y += descLines.length * 4 + 2
  }

  // Divider
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.4)
  doc.line(10, y, W - 10, y)
  y += 5

  // ── Section 1: Invoice Log ─────────────────────────────────────────────────
  y = sectionHead(doc, y, '1. Invoices Processed')

  if (invoices.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MID)
    doc.text('No invoices uploaded yet.', 14, y); y += 8
  } else {
    const invBody = invoices.map(inv => [
      inv.invoice_number || '—',
      inv.billing_firm   || '—',
      fmtDate(inv.invoice_date),
      inv.service_start
        ? `${fmtDate(inv.service_start)} – ${fmtDate(inv.service_end || inv.service_start)}`
        : '—',
      fmtCur(inv.total_amount),
      cap(inv.status),
    ])
    invBody.push(['', '', '', 'TOTAL', fmtCur(totalInvoiced), ''])

    autoTable(doc, {
      startY: y, margin: { left: 10, right: 10 },
      head: [['Invoice #', 'Billing Firm', 'Date', 'Service Period', 'Amount', 'Status']],
      body: invBody,
      styles:     { fontSize: 7.5, cellPadding: 2, textColor: DARK },
      headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 24 }, 1: { cellWidth: 42 }, 2: { cellWidth: 22 },
        3: { cellWidth: 44 }, 4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'center' },
      },
      didParseCell(data) {
        const isTot = data.row.index === invBody.length - 1
        if (isTot) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = LIGHT }
        // Color status
        if (data.column.index === 5 && data.section === 'body' && !isTot) {
          const inv = invoices[data.row.index]
          if (inv) data.cell.styles.textColor = INV_STATUS_COLORS[inv.status] || MID
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Section 2: Party Allocation ────────────────────────────────────────────
  y = checkPage(doc, y, 40)
  y = sectionHead(doc, y, '2. Totals by Party')

  if (parties.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MID)
    doc.text('No parties configured.', 14, y); y += 8
  } else {
    // Merge configured parties (share_percentage) with aggregated financials
    const partyBody = parties.map(p => {
      // Match by name since byParty is keyed by pa.id (apportionment row id, not party id)
      const agg = partyRows.find(r => r.name === p.name) || { obligated: 0, paid: 0 }
      const balance = agg.obligated - agg.paid
      return [
        p.name,
        cap(p.type),
        `${p.share_percentage || 0}%`,
        fmtCur(agg.obligated),
        fmtCur(agg.paid),
        fmtCur(balance),
      ]
    })
    partyBody.push(['TOTAL', '', '', fmtCur(totalObligated), fmtCur(totalPaid), fmtCur(totalBalance)])

    autoTable(doc, {
      startY: y, margin: { left: 10, right: 10 },
      head: [['Party', 'Type', 'Share %', 'Obligated', 'Paid', 'Balance']],
      body: partyBody,
      styles:     { fontSize: 7.5, cellPadding: 2, textColor: DARK },
      headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 55 }, 1: { cellWidth: 30 }, 2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell(data) {
        if (data.row.index === partyBody.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = LIGHT
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Section 3: Insurer Obligations & Payment Status ────────────────────────
  y = checkPage(doc, y, 50)
  y = sectionHead(doc, y, '3. Insurer Obligations & Payment Status')

  if (insurerRows.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MID)
    doc.text('No apportionments calculated yet.', 14, y); y += 8
  } else {
    const insBody = insurerRows.map(r => [
      r.name, r.policyNumber || '—', r.parties,
      fmtCur(r.obligated), fmtCur(r.paid), fmtCur(r.balance),
      STATUS_LABELS[r.status] || '—',
    ])
    insBody.push(['TOTAL', '', '', fmtCur(totalObligated), fmtCur(totalPaid), fmtCur(totalBalance), ''])

    autoTable(doc, {
      startY: y, margin: { left: 10, right: 10 },
      head: [['Insurer', 'Policy #', 'Party', 'Obligated', 'Paid', 'Balance', 'Status']],
      body: insBody,
      styles:     { fontSize: 7.5, cellPadding: 2, textColor: DARK },
      headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 40 }, 1: { cellWidth: 24 }, 2: { cellWidth: 32 },
        3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 18, halign: 'center' },
      },
      didParseCell(data) {
        const isTot = data.row.index === insBody.length - 1
        if (isTot) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = LIGHT }
        if (data.column.index === 6 && data.section === 'body' && !isTot) {
          const row = insurerRows[data.row.index]
          if (row) data.cell.styles.textColor = STATUS_COLORS[row.status] || MID
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Section 4: Payment Status Snapshot ────────────────────────────────────
  y = checkPage(doc, y, 40)
  y = sectionHead(doc, y, '4. Payment Status Snapshot')

  const statusGroups = {}
  for (const r of insurerRows) {
    if (!statusGroups[r.status]) statusGroups[r.status] = { count: 0, obligated: 0, paid: 0 }
    statusGroups[r.status].count++
    statusGroups[r.status].obligated += r.obligated
    statusGroups[r.status].paid      += r.paid
  }
  const snapBody = Object.entries(statusGroups)
    .sort(([a], [b]) => {
      const order = ['disputed', 'demanded', 'partially_paid', 'pending', 'paid']
      return order.indexOf(a) - order.indexOf(b)
    })
    .map(([status, g]) => [
      STATUS_LABELS[status] || status,
      String(g.count),
      fmtCur(g.obligated),
      fmtCur(g.paid),
      fmtCur(g.obligated - g.paid),
    ])

  autoTable(doc, {
    startY: y, margin: { left: 10, right: 10 },
    head: [['Status', 'Carriers', 'Obligated', 'Paid', 'Balance']],
    body: snapBody,
    styles:     { fontSize: 8, cellPadding: 2.5, textColor: DARK },
    headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 32 }, 1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' }, 3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.column.index === 0 && data.section === 'body') {
        const order = ['disputed', 'demanded', 'partially_paid', 'pending', 'paid']
        const status = order[data.row.index] || 'pending'
        data.cell.styles.textColor = STATUS_COLORS[status] || MID
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── Section 5: Insurer Contact Reference ──────────────────────────────────
  const periodsWithContact = (insurerPeriods || []).filter(pp =>
    pp.claims_rep_name || pp.claims_rep_email || pp.claim_number
  )
  if (periodsWithContact.length > 0) {
    y = doc.lastAutoTable.finalY + 6
    y = checkPage(doc, y, 40)
    y = sectionHead(doc, y, '5. Claims Contact Reference')

    const contactBody = periodsWithContact.map(pp => [
      pp.insurers?.name  || '—',
      pp.parties?.name   || '—',
      pp.claim_number    || '—',
      pp.claims_rep_name || '—',
      pp.claims_rep_email || '—',
    ])

    autoTable(doc, {
      startY: y, margin: { left: 10, right: 10 },
      head: [['Insurer', 'Party', 'Claim #', 'Claims Rep', 'Email']],
      body: contactBody,
      styles:     { fontSize: 7.5, cellPadding: 2, textColor: DARK },
      headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 36 }, 1: { cellWidth: 30 }, 2: { cellWidth: 26 },
        3: { cellWidth: 36 }, 4: { cellWidth: 50 },
      },
    })
  }

  // ── Chrome on every page ───────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    chrome(doc, name, totalPages)
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const slug      = name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const dateStamp = format(new Date(), 'yyyy-MM-dd')
  doc.save(`LexAlloc_Matter_Summary_${slug}_${dateStamp}.pdf`)
}
