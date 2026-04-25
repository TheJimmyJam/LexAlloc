import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  TabStopType, TabStopPosition,
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
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

function cellBase(width, isHeader) {
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

function td(text, width, options) {
  const { bold = false, isHeader = false, align = AlignmentType.LEFT, color = '1a1a1a', size = 20 } = options || {}
  return new TableCell({
    ...cellBase(width, isHeader),
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

// --- Method-specific body text -----------------------------------------------

function calcDescription(method, ia, pa) {
  const pct = fmtPct(ia.percentage)
  const insurerName = (ia.insurers && ia.insurers.name) ? ia.insurers.name : 'the insurer'
  const partyName = (pa.parties && pa.parties.name) ? pa.parties.name : 'this party'

  if (method === 'equal_shares') {
    const n = (pa.insurer_apportionments && pa.insurer_apportionments.length) ? pa.insurer_apportionments.length : 1
    return 'Defense costs for ' + partyName + ' have been allocated equally among ' + n +
      ' carrier' + (n !== 1 ? 's' : '') + ', resulting in an equal share of ' +
      pct + ' for ' + insurerName + '.'
  }
  if (method === 'limits_proportional') {
    const pp = ia.insurer_policy_periods
    const limit = (pp && pp.policy_limit) ? fmt(pp.policy_limit) : '[policy limit on file]'
    return 'Defense costs for ' + partyName + ' have been allocated proportionally based on ' +
      'each carrier\'s policy limits. ' + insurerName + '\'s policy limit of ' + limit +
      ' represents ' + pct + ' of the total limits across all triggered policies for this party.'
  }
  // pro_rata_time_on_risk
  const days = (ia.days_on_risk != null) ? ia.days_on_risk : '-'
  const total = (ia.total_days != null) ? ia.total_days : '-'
  return 'Defense costs for ' + partyName + ' have been allocated on a pro-rata time-on-risk ' +
    'basis. ' + insurerName + '\'s policy was on-risk for ' + days + ' of the ' + total +
    ' days in the applicable service period, representing ' + pct + ' of the total exposure.'
}

// --- Main generator ----------------------------------------------------------

export async function generateDemandLetterBlob(data) {
  const { apport, invoice, pa, ia, orgName } = data
  const pp     = ia.insurer_policy_periods
  const today  = format(new Date(), 'MMMM d, yyyy')
  const method = apport.calculation_method || 'pro_rata_time_on_risk'

  // Addressee block
  const addresseeParas = []
  if (ia.insurers && ia.insurers.name) {
    addresseeParas.push(p(ia.insurers.name, { bold: true }))
  }
  if (pp && pp.claims_rep_name) {
    addresseeParas.push(p(pp.claims_rep_name))
  }
  if (pp && pp.billing_address) {
    pp.billing_address.split('\n').forEach(function(line) {
      addresseeParas.push(p(line))
    })
  }

  // Re: block
  const matterName = (apport.matters && apport.matters.name) ? apport.matters.name : 'Matter'
  const matterNum  = (apport.matters && apport.matters.matter_number) ? ' (Matter No. ' + apport.matters.matter_number + ')' : ''
  const reLines = [matterName + matterNum]
  if (pp && pp.claim_number)             { reLines.push('Claim No. ' + pp.claim_number) }
  if (ia.insurers && ia.insurers.policy_number) { reLines.push('Policy No. ' + ia.insurers.policy_number) }
  reLines.push('Invoice No. ' + (invoice.invoice_number || '-') + ' dated ' + fmtDate(invoice.invoice_date))

  const reParas = reLines.map(function(line, i) {
    return new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: i === 0 ? 'Re:\t' : '\t', bold: i === 0, font: 'Arial', size: 20 }),
        new TextRun({ text: line, font: 'Arial', size: 20 }),
      ],
      tabStops: [{ type: TabStopType.LEFT, position: 520 }],
    })
  })

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
        td(invoice.invoice_number || '-',   2340),
        td(fmtDate(invoice.invoice_date),   2340),
        td(invoice.billing_firm || '-',     2340),
        tdR(fmt(invoice.total_amount),      2340),
      ]}),
    ]
  })

  // Obligation table labels
  var torLabel = (ia.insurers && ia.insurers.name ? ia.insurers.name : 'Insurer') +
    ' time-on-risk (' + (ia.days_on_risk != null ? ia.days_on_risk : '-') +
    ' / ' + (ia.total_days != null ? ia.total_days : '-') + ' days)'

  var totalDueLabel = 'Total due from ' + ((ia.insurers && ia.insurers.name) ? ia.insurers.name : 'Insurer')

  var obligationRows = []
  obligationRows.push(new TableRow({ children: [
    th('Description', 5200),
    th('Percentage',  2080),
    th('Amount',      2080),
  ]}))
  obligationRows.push(new TableRow({ children: [
    td(((pa.parties && pa.parties.name) ? pa.parties.name : 'Party') + ' share of invoice', 5200),
    tdR(fmtPct(pa.percentage), 2080),
    tdR(fmt(pa.amount),        2080),
  ]}))
  if (method === 'pro_rata_time_on_risk') {
    obligationRows.push(new TableRow({ children: [
      td(torLabel, 5200),
      tdR(fmtPct(ia.percentage), 2080),
      tdR('', 2080),
    ]}))
  }
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

  // Service period text
  var servicePeriodText = fmtDate(invoice.service_start)
  if (invoice.service_end && invoice.service_end !== invoice.service_start) {
    servicePeriodText += ' through ' + fmtDate(invoice.service_end)
  }

  var partyName = (pa.parties && pa.parties.name) ? pa.parties.name : 'The insured party'
  var salutation = (pp && pp.claims_rep_name) ? 'Dear ' + pp.claims_rep_name + ':' : 'Dear Sir or Madam:'
  var paymentAmt = fmt(ia.amount)
  var firmName = orgName || '[Law Firm Name]'

  var openingPara = 'This letter constitutes a formal demand for payment of defense costs incurred in ' +
    'connection with the above-referenced matter. Please review the following apportionment ' +
    'calculation and remit payment in the amount set forth below.'

  var partySharePara = partyName + ' bears ' + fmtPct(pa.percentage) + ' of the defense obligation ' +
    'for this invoice, corresponding to a total party obligation of ' + fmt(pa.amount) + '.'

  var paymentPara = 'Payment of ' + paymentAmt + ' is requested within thirty (30) days of the ' +
    'date of this letter. Please make checks payable to ' + firmName + ' and remit to the following address:'

  var closingPara = 'If you have any questions regarding this demand or the underlying calculation ' +
    'methodology, please do not hesitate to contact the undersigned.'

  var referencePara = 'Please reference the matter name, claim number, and invoice number on all ' +
    'correspondence and remittances to ensure proper application of payment.'

  const children = [
    // Letterhead
    new Paragraph({
      spacing: { before: 0, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '2E4057', space: 1 } },
      children: [
        new TextRun({ text: firmName, bold: true, font: 'Arial', size: 28, color: '2E4057' }),
        new TextRun('\t'),
        new TextRun({ text: today, font: 'Arial', size: 20, color: '555555' }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    }),

    blank(200),
  ].concat(addresseeParas).concat([
    blank(200),
  ]).concat(reParas).concat([
    blank(240),
    p(salutation, { after: 200 }),
    p(openingPara, { after: 0 }),
    blank(0),
    sectionRule('Invoice Summary'),
    invoiceTable,
    blank(80),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: 'Service Period: ', bold: true, font: 'Arial', size: 20 }),
        new TextRun({ text: servicePeriodText, font: 'Arial', size: 20 }),
      ]
    }),
    blank(0),
    sectionRule('Allocated Obligation'),
    p(partySharePara, { after: 180 }),
    p(calcDescription(method, ia, pa), { after: 180 }),
    obligationTable,
    blank(0),
    sectionRule('Payment Instructions'),
    p(paymentPara, { after: 180 }),
    p('[PAYMENT INSTRUCTIONS / REMITTANCE ADDRESS]', { bold: true, color: 'AA2200', after: 180 }),
    p(referencePara, { after: 0 }),
    blank(0),
    p(closingPara, { after: 240 }),
    p('Very truly yours,', { after: 0 }),
    blank(0),
    blank(0),
    blank(0),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '555555', space: 1 } },
      children: [new TextRun({ text: '', font: 'Arial', size: 20 })]
    }),
    p(firmName, { bold: true }),
    p('[Attorney Name]'),
    p('[Phone] | [Email]'),
    new Paragraph({
      spacing: { before: 400, after: 0 },
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC', space: 1 } },
      children: [new TextRun({
        text: 'ATTORNEY WORK PRODUCT - PRIVILEGED AND CONFIDENTIAL',
        font: 'Arial', size: 16, color: '888888', italics: true,
      })]
    }),
  ])

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
      children: children,
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
