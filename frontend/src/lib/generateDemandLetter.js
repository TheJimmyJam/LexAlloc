import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  TabStopType, TabStopPosition, ImageRun,
} from 'docx'
import { format, parseISO } from 'date-fns'

// --- Helpers ------------------------------------------------------------------

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
}
function fmtPct(n) { return `${(n || 0).toFixed(2)}%` }
function fmtDate(d) {
  if (!d) return '-'
  return format(typeof d === 'string' ? parseISO(d) : d, 'MMMM d, yyyy')
}

// US Letter with 1-inch margins = 9360 DXA content width
const W = 9360
const BORDER  = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

function cellBase(width, isHeader, customFill) {
  return {
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: customFill || (isHeader ? 'EDF0F5' : 'FFFFFF'), type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
  }
}

function td(text, width, options) {
  const { bold = false, isHeader = false, align = AlignmentType.LEFT, color = '1a1a1a', size = 20, customFill } = options || {}
  return new TableCell({
    ...cellBase(width, isHeader, customFill),
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text != null ? text : '-'), bold, font: 'Arial', size, color })]
    })]
  })
}

function th(text, width) { return td(text, width, { bold: true, isHeader: true }) }
function tdR(text, width, opts) { return td(text, width, Object.assign({}, opts, { align: AlignmentType.RIGHT })) }

function sectionRule(text) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2E4057', space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, font: 'Arial', size: 20, color: '2E4057' })]
  })
}

function p(text, options) {
  const { bold = false, size = 20, color = '1a1a1a', before = 0, after = 0, align = AlignmentType.LEFT } = options || {}
  return new Paragraph({
    alignment: align,
    spacing: { before, after },
    children: [new TextRun({ text, bold, font: 'Arial', size, color })]
  })
}

function blank(before) { return p('', { before: before || 0 }) }

// Fetch logo as ArrayBuffer for embedding in docx
async function fetchLogoBuffer(logoUrl) {
  try {
    const url = logoUrl ||
      (typeof window !== 'undefined' ? window.location.origin + '/logo-icon.png' : null)
    if (!url) return null
    const resp = await fetch(url)
    if (!resp.ok) return null
    return await resp.arrayBuffer()
  } catch {
    return null
  }
}

// --- Method-specific body text -----------------------------------------------

function calcDescription(method, ia, pa) {
  const pct         = fmtPct(ia.percentage)
  const insurerName = (ia.insurers && ia.insurers.name) ? ia.insurers.name : 'the insurer'
  const partyName   = (pa.parties  && pa.parties.name)  ? pa.parties.name  : 'this party'

  if (method === 'equal_shares') {
    const n = (pa.insurer_apportionments && pa.insurer_apportionments.length) ? pa.insurer_apportionments.length : 1
    return 'Costs for ' + partyName + ' have been allocated equally among ' + n +
      ' carrier' + (n !== 1 ? 's' : '') + ', resulting in an equal share of ' +
      pct + ' for ' + insurerName + '.'
  }
  if (method === 'limits_proportional') {
    const pp    = ia.insurer_policy_periods
    const limit = (pp && pp.policy_limit) ? fmt(pp.policy_limit) : '[policy limit on file]'
    return 'Costs for ' + partyName + ' have been allocated proportionally based on ' +
      'each carrier\'s policy limits. ' + insurerName + '\'s policy limit of ' + limit +
      ' represents ' + pct + ' of the total limits across all triggered policies for this party.'
  }
  // pro_rata_time_on_risk
  const days  = (ia.days_on_risk != null) ? ia.days_on_risk : '-'
  const total = (ia.total_days   != null) ? ia.total_days   : '-'
  return 'Costs for ' + partyName + ' have been allocated on a pro-rata time-on-risk ' +
    'basis. ' + insurerName + '\'s policy was on-risk for ' + days + ' of the ' + total +
    ' days in the applicable coverage period, representing ' + pct + ' of the total exposure.'
}

// --- Main generator ----------------------------------------------------------

export async function generateDemandLetterBlob(data) {
  const { apport, invoice, pa, ia, orgName, logoUrl, lexallocInvoiceNumber } = data
  const pp       = ia.insurer_policy_periods
  const today    = format(new Date(), 'MMMM d, yyyy')
  const method   = apport.calculation_method || 'pro_rata_time_on_risk'
  const firmName = orgName || '[Law Firm Name]'

  // Logo
  const logoBuffer = await fetchLogoBuffer(logoUrl)

  // ── Addressee block — contact first, then company, then address ──────────────
  const addresseeParas = []
  if (pp && pp.claims_rep_name) {
    addresseeParas.push(p(pp.claims_rep_name, { bold: true }))
  }
  if (ia.insurers && ia.insurers.name) {
    addresseeParas.push(p(ia.insurers.name))
  }
  if (pp && pp.billing_address) {
    pp.billing_address.split('\n').forEach(function(line) { addresseeParas.push(p(line)) })
  }

  // ── Re: block — labeled fields ────────────────────────────────────────────────
  const matterName = (apport.matters && apport.matters.name) ? apport.matters.name : 'Matter'
  const firmLabel  = invoice.billing_firm || (apport.matters && apport.matters.firm_name) || '-'

  const reLines = [
    { label: 'Case Name:',             value: matterName },
    { label: 'Firm:',                  value: firmLabel },
    { label: 'Firm Matter No.:',       value: (apport.matters && apport.matters.matter_number) || '' },
    { label: 'Firm Invoice No.:',      value: invoice.invoice_number || '' },
    { label: 'LexAlloc Invoice No.:', value: lexallocInvoiceNumber || ia.lexalloc_invoice_number || '' },
    { label: 'Insurer Claim No.:',     value: (pp && pp.claim_number) || '' },
  ]

  const TAB_POS = 2900  // value column left-aligns here

  const reParas = reLines.map(function(line) {
    return new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: line.label, bold: true, font: 'Arial', size: 20 }),
        new TextRun({ text: '\t', font: 'Arial', size: 20 }),
        new TextRun({ text: line.value, font: 'Arial', size: 20 }),
      ],
      tabStops: [{ type: TabStopType.LEFT, position: TAB_POS }],
    })
  })

  // ── Service period ────────────────────────────────────────────────────────────
  var servicePeriodText = fmtDate(invoice.service_start)
  if (invoice.service_end && invoice.service_end !== invoice.service_start) {
    servicePeriodText += ' through ' + fmtDate(invoice.service_end)
  }

  // ── Invoice summary table — Service Period replaces Billing Firm ──────────────
  const invoiceTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [
      new TableRow({ children: [
        th('Invoice Number', 2340),
        th('Invoice Date',   2340),
        th('Service Period', 2340),
        th('Total Amount',   2340),
      ]}),
      new TableRow({ children: [
        td(invoice.invoice_number || '-', 2340),
        td(fmtDate(invoice.invoice_date), 2340),
        td(servicePeriodText,             2340),
        tdR(fmt(invoice.total_amount),    2340),
      ]}),
    ]
  })

  // ── Obligation table — party as folder header, all insurers listed below ──────
  var partyName   = (pa.parties && pa.parties.name) ? pa.parties.name : 'Party'
  var allInsurers = (pa.insurer_apportionments && pa.insurer_apportionments.length > 0)
    ? pa.insurer_apportionments
    : [ia]

  const FOLDER_FILL = 'C8D3E0'   // medium blue-gray for the party folder row
  const FOLDER_COLOR = '2E4057'  // dark navy text

  var obligationRows = []

  // Header row
  obligationRows.push(new TableRow({ children: [
    th('Description', 5200),
    th('Percentage',  2080),
    th('Amount',      2080),
  ]}))

  // Party folder row — shaded, bold, acts as group header
  obligationRows.push(new TableRow({ children: [
    new TableCell({
      ...cellBase(5200, false, FOLDER_FILL),
      children: [new Paragraph({
        children: [new TextRun({ text: partyName + ' share of invoice', bold: true, font: 'Arial', size: 20, color: FOLDER_COLOR })]
      })]
    }),
    new TableCell({
      ...cellBase(2080, false, FOLDER_FILL),
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: fmtPct(pa.percentage), bold: true, font: 'Arial', size: 20, color: FOLDER_COLOR })]
      })]
    }),
    new TableCell({
      ...cellBase(2080, false, FOLDER_FILL),
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: fmt(pa.amount), bold: true, font: 'Arial', size: 20, color: FOLDER_COLOR })]
      })]
    }),
  ]}))

  // All insurer rows — indented under the party folder; highlight the target insurer
  allInsurers.forEach(function(eachIa) {
    const eachName = (eachIa.insurers && eachIa.insurers.name) ? eachIa.insurers.name : 'Insurer'
    const isTarget = eachIa.id === ia.id

    var descText = '    ' + eachName   // indent
    if (method === 'pro_rata_time_on_risk') {
      descText += ' – ' +
        (eachIa.days_on_risk != null ? eachIa.days_on_risk : '-') +
        ' / ' +
        (eachIa.total_days   != null ? eachIa.total_days   : '-') +
        ' days'
    }

    obligationRows.push(new TableRow({ children: [
      td(descText,                isTarget ? 5200 : 5200, { bold: isTarget }),
      tdR(fmtPct(eachIa.percentage), 2080,               { bold: isTarget }),
      tdR(fmt(eachIa.amount),        2080,               { bold: isTarget }),
    ]}))
  })

  // Total due row
  var totalDueLabel = 'Total due from ' + ((ia.insurers && ia.insurers.name) ? ia.insurers.name : 'Insurer')
  obligationRows.push(new TableRow({ children: [
    new TableCell({
      borders: BORDERS,
      width: { size: 5200, type: WidthType.DXA },
      shading: { fill: 'EDF0F5', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text: totalDueLabel, bold: true, font: 'Arial', size: 20 })]
      })]
    }),
    tdR('', 2080, { isHeader: true }),
    new TableCell({
      borders: BORDERS,
      width: { size: 2080, type: WidthType.DXA },
      shading: { fill: 'EDF0F5', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: fmt(ia.amount), bold: true, font: 'Arial', size: 22, color: '1a4480' })]
      })]
    }),
  ]}))

  var obligationTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [5200, 2080, 2080],
    rows: obligationRows,
  })

  // ── Body text ─────────────────────────────────────────────────────────────────
  var salutation = (pp && pp.claims_rep_name) ? 'Dear ' + pp.claims_rep_name + ':' : 'Dear Sir or Madam:'
  var paymentAmt = fmt(ia.amount)

  // Opening: first sentence deleted; "for the above captioned matter" added to remaining sentence
  var openingPara = 'Please review the following apportionment calculation and remit payment ' +
    'in the amount set forth below for the above captioned matter.'

  // Party share: "defense" removed
  var partySharePara = partyName + ' bears ' + fmtPct(pa.percentage) + ' of the obligation ' +
    'for this invoice, corresponding to a total party obligation of ' + fmt(pa.amount) + '.'

  var paymentPara = 'Payment of ' + paymentAmt + ' is requested within thirty (30) days of the ' +
    'date of this letter. Please make checks payable to ' + firmName + ' and remit to the following address:'

  var closingPara = 'If you have any questions regarding this demand or the underlying calculation ' +
    'methodology, please do not hesitate to contact the undersigned.'

  var referencePara = 'Please reference the matter name, claim number, and invoice number on all ' +
    'correspondence and remittances to ensure proper application of payment.'

  // ── Assemble document ─────────────────────────────────────────────────────────
  const children = []

  // ── Header: logo left, date right — two-cell borderless table with bottom rule ─
  const NO_BORDER   = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' }
  const HDR_BOTTOM  = { style: BorderStyle.SINGLE, size: 8, color: '2E4057', space: 1 }
  const HALF = Math.floor(W / 2)

  const logoPara = logoBuffer
    ? new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new ImageRun({ data: logoBuffer, transformation: { width: 60, height: 60 }, type: 'png' })]
      })
    : new Paragraph({ children: [] })

  const datePara = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing:   { before: 0, after: 0 },
    children:  [new TextRun({ text: today, font: 'Arial', size: 20, color: '555555' })]
  })

  children.push(new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [HALF, W - HALF],
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: HALF, type: WidthType.DXA },
          verticalAlign: VerticalAlign.BOTTOM,
          borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: HDR_BOTTOM },
          margins: { top: 0, bottom: 60, left: 0, right: 0 },
          children: [logoPara],
        }),
        new TableCell({
          width: { size: W - HALF, type: WidthType.DXA },
          verticalAlign: VerticalAlign.BOTTOM,
          borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: HDR_BOTTOM },
          margins: { top: 0, bottom: 60, left: 0, right: 0 },
          children: [datePara],
        }),
      ],
    })],
  }))

  children.push(blank(200))
  addresseeParas.forEach(function(ap) { children.push(ap) })
  children.push(blank(200))
  reParas.forEach(function(rp) { children.push(rp) })
  children.push(blank(240))
  children.push(p(salutation, { after: 200 }))
  children.push(p(openingPara, { after: 0 }))
  children.push(blank(0))
  children.push(sectionRule('Invoice Summary'))
  children.push(invoiceTable)
  children.push(blank(0))
  children.push(sectionRule('Allocated Obligation'))
  children.push(p(partySharePara, { after: 180 }))
  children.push(p(calcDescription(method, ia, pa), { after: 180 }))
  children.push(obligationTable)
  children.push(blank(0))
  children.push(sectionRule('Payment Instructions'))
  children.push(p(paymentPara, { after: 180 }))
  children.push(p('[PAYMENT INSTRUCTIONS / REMITTANCE ADDRESS]', { bold: true, color: 'AA2200', after: 180 }))
  children.push(p(referencePara, { after: 0 }))
  children.push(blank(0))
  children.push(p(closingPara, { after: 240 }))
  children.push(p('Very truly yours,', { after: 0 }))
  children.push(blank(0))
  children.push(blank(0))
  children.push(blank(0))
  children.push(new Paragraph({
    spacing: { before: 0, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '555555', space: 1 } },
    children: [new TextRun({ text: '', font: 'Arial', size: 20 })]
  }))
  children.push(p(firmName, { bold: true }))
  children.push(p('Michael Mason'))
  children.push(p('Mason@LexAlloc.com'))
  children.push(new Paragraph({
    spacing: { before: 400, after: 0 },
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 1 } },
    children: [new TextRun({
      text: 'ATTORNEY WORK PRODUCT - PRIVILEGED AND CONFIDENTIAL',
      font: 'Arial', size: 16, color: '888888', italics: true,
    })]
  }))

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

export function getDemandLetterFilename(data) {
  var apport  = data.apport
  var invoice = data.invoice
  var ia      = data.ia
  function clean(s) {
    return (s || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '')
  }
  var matter  = clean(apport.matters && apport.matters.name)   || 'Matter'
  var inv     = clean(invoice.invoice_number)                  || 'Invoice'
  var insurer = clean(ia.insurers && ia.insurers.name)         || 'Insurer'
  return 'Demand_' + matter + '_' + inv + '_' + insurer + '.docx'
}
