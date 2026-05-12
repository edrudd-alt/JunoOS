// LEGACY: April 2026 jsPDF generator. Superseded by transactionStatement@1.0.0 (Stage 6c). Retained only because InvestmentCockpit.tsx imports it. To be removed when the cockpit page is deprecated.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Colours ──────────────────────────────────────────────────────────────────

const NAVY    = '#0f2744'
const BLUE    = '#185fa5'
const LIGHT   = '#f0f3f7'
const BORDER  = '#d0d8e4'
const GREY    = '#666666'
const WHITE   = '#ffffff'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function setFill(doc: jsPDF, hex: string) {
  doc.setFillColor(...hexToRgb(hex))
}

function setTextColor(doc: jsPDF, hex: string) {
  doc.setTextColor(...hexToRgb(hex))
}

function setDrawColor(doc: jsPDF, hex: string) {
  doc.setDrawColor(...hexToRgb(hex))
}

function drawRule(doc: jsPDF, y: number) {
  setDrawColor(doc, BORDER)
  doc.setLineWidth(0.3)
  doc.line(14, y, 196, y)
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/juno-logo.png')
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    const bytes  = new Uint8Array(buffer)
    const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
    return `data:image/png;base64,${btoa(binary)}`
  } catch {
    return null
  }
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    drawRule(doc, 276)
    setTextColor(doc, GREY)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text('Juno Capital Partners LLP  ·  91 Wimpole Street, London W1G 0EF', 14, 281)
    doc.text(
      'Registered Number: OC368953  ·  jhickman@junocapital.co.uk  ·  020 3011 0783  ·  www.junocapital.co.uk',
      14, 287,
    )
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface TransactionStatementData {
  investorName:    string
  companyName:     string
  eisStatus:       string
  investmentDate:  string
  shareClass:      string
  purchasePrice:   string
  sharesPurchased: string
  sumSubscribed:   string
  junoFee:         string
  totalCost:       string
}

export async function generateTransactionStatement(
  data: TransactionStatementData,
): Promise<Blob> {
  const doc      = new jsPDF({ unit: 'mm', format: 'a4' })
  const logoUrl  = await loadLogoDataUrl()

  // ── Logo (top-right) ───────────────────────────────────────────────────────
  if (logoUrl) {
    doc.addImage(logoUrl, 'PNG', 135, 12, 58, 19)
  }

  // ── Header text (top-left) ─────────────────────────────────────────────────
  setTextColor(doc, BLUE)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Investment Confirmation', 14, 20)

  setTextColor(doc, NAVY)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(data.companyName, 14, 30)

  // ── Divider ────────────────────────────────────────────────────────────────
  drawRule(doc, 36)

  // ── Detail block ──────────────────────────────────────────────────────────
  const details: [string, string][] = [
    ['Investor Name', data.investorName],
    ['Company',       data.companyName],
    ['EIS Status',    data.eisStatus],
  ]

  let y = 44
  for (const [label, value] of details) {
    setTextColor(doc, GREY)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(label, 14, y)

    setTextColor(doc, NAVY)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(value, 14, y + 5)

    y += 14
  }

  // ── Transaction table ──────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y + 2,
    head: [[
      'Investment Date',
      'Share Class',
      'Purchase Price',
      'Shares Purchased',
      'Sum Subscribed',
    ]],
    body: [[
      data.investmentDate,
      data.shareClass,
      data.purchasePrice,
      data.sharesPurchased,
      data.sumSubscribed,
    ]],
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: hexToRgb(NAVY),
      textColor: hexToRgb(WHITE),
      fontStyle: 'bold',
    },
    bodyStyles: {
      fillColor: hexToRgb(LIGHT),
      textColor: hexToRgb(NAVY),
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  // ── Fee / total rows (right-aligned, below table) ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY as number

  const feeRows: [string, string][] = [
    ['Juno Fee',   data.junoFee],
    ['Total Cost', data.totalCost],
  ]

  let fy = finalY + 8
  for (const [label, value] of feeRows) {
    setTextColor(doc, GREY)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(label, 140, fy)

    setTextColor(doc, NAVY)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(value, 196, fy, { align: 'right' })

    fy += 7
  }

  // ── Divider ────────────────────────────────────────────────────────────────
  drawRule(doc, fy + 4)

  // ── Additional information ─────────────────────────────────────────────────
  setTextColor(doc, NAVY)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Additional Information', 14, fy + 12)

  setTextColor(doc, GREY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `This is to confirm your investment into ${data.companyName}. Thank you for your investment.`,
    14,
    fy + 20,
  )

  // ── Footer on all pages ────────────────────────────────────────────────────
  addFooter(doc)

  return doc.output('blob')
}
