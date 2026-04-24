import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  TabStopType, TabStopPosition,
} from 'docx'
import { format, parseISO } from 'date-fns'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
}
function fmtPct(n) { return `${(n || 0).toFixed(2)}%` }
function fmtDate(d) {
  if (!d) return '—'
  return format(typeof d === 'string' ? parseISO(d) : d, 'MMMM d, yyyy')
}

// US Letter, 1-inch margins → 9360 DXA content width
const W = 9360
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

function cellBase(width, isHeader = false) {
  return {
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader
      ? { fill: 'EDF0F5', type: ShadingType.CLEAR }
      : { fill: 'FFFFFF', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
  }
}

function td(text, width, { bold = false, isHeader = false, align = AlignmentType.LEFT, color = '1a1a1a', size = 20 } = {}) {
  return new TableCell({
    ...cellBase(width, isHeader),
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text ?? '—'), bold, font: 'Arial', size, color })]
    })]
  })
}
function th(text, width) { return td(text, width, { bold: true, isHeader: true }) }
function tdR(text, width, opts = {}) { return td(text, width, { ...opts, align: AlignmentType.RIGHT }) }

function sectionRule(text) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2E4057', space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, font: 'Arial', size: 20, color: '2E4057' })]
  })
}

function p(text, { bold = false, size = 20, color = '1a1a1a', before = 0, after = 0, align = AlignmentType.LEFT } = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { before, after },
    children: [new TextRun({ text, bold, font: 'Arial', size, color })]
  })
}

function blank(before = 0) { return p('', { before }) }

// ─── Method-specific body text ────────────────────────────────────────────────

function calcDescription(method, ia, pa) {
  const pct = fmtPct(ia.percentage)
  const insurerName = ia.insurers?.name || 'the insurer'

  if (method === 'equal_shares') {
    const n = pa.insurer_apportionments?.length || 1
    return (
      `Defense costs for ${pa.parties?.name || 'this party'} have been allocated equally ` +
      `among ${n} triggered carrier${n !== 1 ? 's' : ''}, resulting in an equal share of ` +
      `${pct} for ${insurerName}.`
    )
  }
  if (method === 'limits_proportional') {
    const pp = ia.insurer_policy_periods
    const limit = pp?.policy_limit ? fmt(pp.policy_limit) : '[policy limit on file]'
    return (
      `Defense costs for ${pa.parties?.name || 'this party'} have been allocated ` +
      `proportionally based on each carrier's policy limits. ${insurerName}'s policy limit ` +
      `of ${limit} represents ${pct} of the total limits across all triggered policies ` +
      `for this party.`
    )
  }
  // pro_rata_time_on_risk
  const days = ia.days_on_risk ?? '—'
  const total = ia.total_days ?? '—'
  return (
    `Defense costs for ${pa.parties?.name || 'this party'} have been allocated on a ` +
    `pro-rata time-on-risk basis. ${insurerName}'s policy was on-risk for ${days} of the ` +
    `${total} days in the applicable service period, representing ${pct} of the total exposure.`
  )
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateDemandLetterBlob({ apport, invoice, pa, ia, orgName }) {
  const pp     = ia.insurer_policy_periods
  const today  = format(new Date(), 'MMMM d, yyyy')
  const method = apport.calculation_method || 'pro_rata_time_on_risk'

  // Addressee lines
  const addresseeParas = [
    ia.insurers?.name     ? p(ia.insurers.name, { bold: true }) : null,
    pp?.claims_rep_name   ? p(pp.claims_rep_name) : null,
    ...(pp?.billing_address
      ? pp.billing_address.split('\n').map(line => p(line))
      : []),
  ].filter(Boolean)

  // Re: indented block
  const reLines = [
    `${apport.matters?.name || 'Matter'}${apport.matters?.matter_number ? ` (Matter No. ${apport.matters.matter_number})` : ''}`,
    pp?.claim_number          ? `Claim No. ${pp.claim_number}` : null,
    ia.insurers?.policy_number ? `Policy No. ${ia.insurers.policy_number}` : null,
    `Invoice No. ${invoice.invoice_number || '—'} dated ${fmtDate(invoice.invoice_date)}`,
  ].filter(Boolean)

  const reParas = reLines.map((line, i) => new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({ text: i === 0 ? 'Re:\t' : '\t', bold: i === 0, font: 'Arial', size: 20 }),
      new TextRun({ text: line, font: 'Arial', size: 20 }),
    ],
    tabStops: [{ type: TabStopType.LEFT, position: 520 }],
  }))

  // Invoice summary table
  const invoiceTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [
      new TableRow({ children: [
        th('Invoice Number', 2340),
        th('Invoice Date',   2340),
        th('Billing Firm',   2340),
        th('Total Amount',   2340),
      ]}),
      new TableRow({ children: [
        td(invoice.invoice_number || '—', 2340),
        td(fmtDate(invoice.invoice_date),  2340),
        td(invoice.billing_firm || '—',    2340),
        tdR(fmt(invoice.total_amount),     2340),
      ]}),
    ]
  })

  // Obligation table rows — method-specific middle row
  const obligationMiddleRows = method === 'pro_rata_time_on_risk'
    ? [new TableRow({ children: [
        td(
          `${ia.insurers?.name || 'Insurer'} time-on-risk ` +
          `(${ia.days_on_risk ?? '—'} / ${ia.total_days ?? '—'} days)`,
          5200
        ),
        tdR(fmtPct(ia.percentage), 2080),
        tdR('', 2080),
      ]})]
    : []

  const obligationTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [5200, 2080, 2080],
    rows: [
      new TableRow({ children: [
        th('Description', 5200),
        th('Percentage',  2080),
        th('Amount',      2080),
      ]}),
      new TableRow({ children: [
        td(`${pa.parties?.name || 'Party'} share of invoice`, 5200),
        tdR(fmtPct(pa.percentage), 2080),
        tdR(fmt(pa.amount),        2080),
      ]}),
      ...obligationMiddleRows,
      // Total row
      new TableRow({ children: [
        new TableCell({
          ...cellBase(5200, true),
          children: [new Paragraph({
            children: [new TextRun({
              text: `Total due from ${ia.insurers?.name || 'Insurer'}`,
              bold: true, font: 'Arial', size: 20,
            })]
          })]
        }),
        tdR('', 2080, { isHeader: true }),
        new TableCell({
          ...cellBase(2080, true),
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({
              text: fmt(ia.amount),
              bold: true, font: 'Arial', size: 22, color: '1a4480',
            })]
          })]
        }),
      ]),
    ]
  })

  const children = [
    // ── Letterhead ──
    new Paragraph({
      spacing: { before: 0, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '2E4057', space: 1 } },
      children: [
        new TextRun({ text: orgName || 'Law Firm', bold: true, font: 'Arial', size: 28, color: '2E4057' }),
        new TextRun('\t'),
        new TextRun({ text: today, font: 'Arial', size: 20, color: '555555' }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    }),

    blank(200),

    // ── Addressee ──
    ...addresseeParas,
    blank(200),

    // ── Re: block ──
    ...reParas,
    blank(240),

    // ── Salutation ──
    p(
      pp?.claims_rep_name ? `Dear ${pp.claims_rep_name}:` : 'Dear Sir or Madam:',
      { after: 200 }
    ),

    // ── Opening ──
    p(
      'This letter constitutes a formal demand for payment of defense costs incurred in ' +
      'connection with the above-referenced matter. Please review the following apportionment ' +
      'calculation and remit payment in the amount set forth below.',
      { after: 0 }
    ),

    blank(0),

    // ── Invoice Summary ──
    sectionRule('Invoice Summary'),
    invoiceTable,
    blank(80),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: 'Service Period: ', bold: true, font: 'Arial', size: 20 }),
        new TextRun({
          text: invoice.service_start
            ? `${fmtDate(invoice.service_start)}${
                invoice.service_end && invoice.service_end !== invoice.service_start
                  ? ` through ${fmtDate(invoice.service_end)}`
                  : ''
              }`
            : '—',
          font: 'Arial', size: 20,
        }),
      ]
    }),

    blank(0),

    // ── Allocated Obligation ──
    sectionRule('Allocated Obligation'),
    p(
      `${pa.parties?.name || 'The insured party'} bears ${fmtPct(pa.percentage)} of the ` +
      `defense obligation for this invoice, corresponding to a total party obligation of ` +
      `${fmt(pa.amount)}.`,
      { after: 180 }
    ),
    p(calcDescription(method, ia, pa), { after: 180 }),
    obligationTable,

    blank(0),

    // ── Payment Instructions ──
    sectionRule('Payment Instructions'),
    p(
      `Payment of ${fmt(ia.amount)} is requested within thirty (30) days of the date of ` +
      `this letter. Please make checks payable to ${orgName || '[Law Firm Name]'} and ` +
      `remit to the following address:`,
      { after: 180 }
    ),
    p('[PAYMENT INSTRUCTIONS / REMITTANCE ADDRESS]', { bold: true, color: 'AA2200', after: 180 }),
    p(
      'Please reference the matter name, claim number, and invoice number on all ' +
      'correspondence and remittances to ensure proper application of payment.',
      { after: 0 }
    ),

    blank(0),

    // ── Closing ──
    p(
      'If you have any questions regarding this demand or the underlying calculation ' +
      'methodology, please do not hesitate to contact the undersigned.',
      { after: 240 }
    ),
    p('Very truly yours,', { after: 0 }),
    blank(0),
    blank(0),
    blank(0),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '555555', space: 1 } },
      children: [new TextRun({ text: '', font: 'Arial', size: 20 })]
    }),
    p(orgName || '[Law Firm Name]', { bold: true }),
    p('[Attorney Name]'),
    p('[Phone]  |  [Email]'),

    // ── Confidentiality footer ──
    new Paragraph({
      spacing: { before: 400, after: 0 },
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 1 } },
      children: [new TextRun({
        text: 'ATTORNEY WORK PRODUCT — PRIVILEGED AND CONFIDENTIAL',
        font: 'Arial', size: 16, color: '888888', italics: true,
      })]
    }),
  ]

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children,
    }]
  })

  return Packer.toBlob(doc)
}

export function getDemandLetterFilename({ apport, invoice, ia }) {
  const clean = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const matter  = clean(apport.matters?.name)  || 'Matter'
  const inv     = clean(invoice.invoice_number) || 'Invoice'
  const insurer = clean(ia.insurers?.name)      || 'Insurer'
  return `Demand_${matter}_${inv}_${insurer}.docx`
}
