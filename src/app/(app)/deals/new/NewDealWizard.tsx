'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Company, Client, DealInvestor, WizardDocument } from './wizardTypes'
import { DEAL_TYPES } from './wizardTypes'
import { StepBar } from './wizardHelpers'
import { DealSetupStep } from './DealSetupStep'
import { DocumentsStep } from './DocumentsStep'
import { SendStep } from './SendStep'
import { TrackStep } from './TrackStep'
import { CompleteStep } from './CompleteStep'

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewDealWizard({
  companies: companiesRaw,
  clients: clientsRaw,
  initialDealType,
}: {
  companies: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  initialDealType?: string
}) {
  const companies = companiesRaw as unknown as Company[]
  const clients   = clientsRaw  as unknown as Client[]
  const router    = useRouter()

  const [step, setStep]     = useState(0)
  const [dealId, setDealId] = useState<string | null>(null)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  // ── Step 1 state ──
  const [dealType,       setDealType]       = useState(initialDealType ?? 'new_investment')
  const [companyId,      setCompanyId]      = useState('')
  const [shareClass,     setShareClass]     = useState('')
  const [amount,         setAmount]         = useState('')
  const [sharePrice,     setSharePrice]     = useState('')
  const [investmentDate, setInvestmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [eisQualifying,  setEisQualifying]  = useState<'yes' | 'no' | 'tbc'>('tbc')
  const [investors,      setInvestors]      = useState<DealInvestor[]>([])
  const [clientSearch,   setClientSearch]   = useState('')

  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    signed_application:    true,
    signed_agreement:      true,
    share_certificate:     true,
    eis_certificate:       false,
    transaction_statement: true,
  })

  // ── Step 2 state ──
  const [documents, setDocuments] = useState<WizardDocument[]>([
    { id: 'app',  name: 'Application form',     type: 'application_form',     signingRequired: true  },
    { id: 'agr',  name: 'Investment agreement',  type: 'investment_agreement',  signingRequired: true  },
    { id: 'stmt', name: 'Transaction statement', type: 'transaction_statement', signingRequired: false },
  ])
  const [reminderDays, setReminderDays] = useState('3')
  const [signingOrder, setSigningOrder] = useState<'sequential' | 'parallel'>('parallel')

  // ── Step 3 state ──
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sentDate,     setSentDate]     = useState<string | null>(null)

  // ── Step 4 invoice state ──
  const [showInvoiceCard,    setShowInvoiceCard]    = useState(false)
  const [invoiceInvestorIdx, setInvoiceInvestorIdx] = useState(0)
  const [invoiceFeeRate,     setInvoiceFeeRate]     = useState('')
  const [invoicesSaved,      setInvoicesSaved]      = useState<string[]>([])

  // ── Derived ──
  const selectedCompany = companies.find(c => c.id === companyId)
  const sharesCalc = amount && sharePrice
    ? (parseFloat(amount) / parseFloat(sharePrice)).toFixed(0)
    : null
  const isInvestmentDeal = dealType === 'new_investment' || dealType === 'follow_on'

  // ── Create deal in DB at end of step 1 ──
  async function createDeal(): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: deal, error: insertError } = await supabase
      .from('deals')
      .insert({
        deal_type:          dealType,
        company_id:         companyId || null,
        share_class:        shareClass || null,
        investment_amount:  parseFloat(amount) || null,
        share_price:        sharePrice ? parseFloat(sharePrice) : null,
        shares_calculated:  sharesCalc ? parseFloat(sharesCalc) : null,
        investment_date:    investmentDate,
        eis_qualifying:     eisQualifying,
        status:             'draft',
        completion_checklist: {
          signed_application:    checklist.signed_application,
          signed_agreement:      checklist.signed_agreement,
          share_certificate:     checklist.share_certificate,
          eis_certificate:       checklist.eis_certificate,
          transaction_statement: checklist.transaction_statement,
        },
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    if (insertError || !deal) return null

    if (investors.length > 0) {
      await supabase.from('deal_investors').insert(
        investors.map(inv => ({
          deal_id:        deal.id,
          client_id:      inv.clientId,
          amount:         parseFloat(amount) || null,
          poa_held:       inv.poaHeld,
          signing_status: 'pending',
        }))
      )
    }

    await supabase.from('internal_updates').insert({
      company_id:   companyId || null,
      update_type:  'deal',
      description:  `Deal created: ${DEAL_TYPES.find(t => t.value === dealType)?.label} — ${selectedCompany?.name ?? ''}`,
      created_by:   user?.id ?? null,
    })

    return deal.id
  }

  // ── Save invoice ──
  async function saveInvoice(inv: DealInvestor, feeRate: number, dId: string) {
    const supabase = createClient()
    const investmentAmount = parseFloat(amount) || 0
    await supabase.from('invoices').insert({
      deal_id:           dId,
      client_id:         inv.clientId,
      company_id:        companyId || null,
      investment_amount: investmentAmount,
      fee_percentage:    feeRate,
      fee_amount:        investmentAmount * (feeRate / 100),
      vat_amount:        0,
      status:            'draft',
    })
    setInvoicesSaved(prev => [...prev, inv.clientId])
  }

  // ── Step handlers ──
  async function handleStep1Next() {
    if (!dealType) return
    if (isInvestmentDeal && !companyId) {
      setError('Please select a company'); return
    }
    setError('')

    if (dealId) {
      setStep(1); return
    }

    setSaving(true)
    const id = await createDeal()
    if (!id) { setError('Failed to create deal'); setSaving(false); return }
    setDealId(id)
    setSaving(false)
    setStep(1)
  }

  function handleStep2Next() {
    if (!emailSubject && selectedCompany) {
      setEmailSubject(`${selectedCompany.name} — documents for your review`)
    }
    setStep(2)
  }

  async function handleSend() {
    if (!dealId) return
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('deals').update({ status: 'sent' }).eq('id', dealId)

    if (isInvestmentDeal) {
      for (const inv of investors) {
        await supabase.from('investments').insert({
          client_id:            inv.clientId,
          company_id:           companyId,
          share_class:          shareClass,
          investment_date:      investmentDate,
          original_share_price: parseFloat(sharePrice) || 0,
          shares_purchased:     parseFloat(sharesCalc ?? '0') || 0,
          sum_subscribed:       parseFloat(amount) || 0,
          eis_status:           eisQualifying,
          holding_location:     'direct',
          status:               'pending',
        })
      }
    }

    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'deal',
      description: `Documents sent: ${selectedCompany?.name ?? ''} — ${investors.map(i => i.name).join(', ')}`,
      created_by:  user?.id ?? null,
    })

    const today = new Date().toISOString().slice(0, 10)
    setSentDate(today)
    setSaving(false)
    setStep(3)

    if (isInvestmentDeal && investors.length > 0) {
      setInvoiceInvestorIdx(0)
      setInvoiceFeeRate(String(investors[0].feeRate || 5))
      setShowInvoiceCard(true)
    }
  }

  async function handleInvoiceConfirm() {
    if (!dealId) return
    const supabase = createClient()
    await saveInvoice(investors[invoiceInvestorIdx], parseFloat(invoiceFeeRate), dealId)
    await supabase.from('internal_updates').insert({
      company_id:  companyId || null,
      update_type: 'invoice',
      description: `Invoice generated: ${investors[invoiceInvestorIdx].name} — ${formatCurrency(parseFloat(amount) * (parseFloat(invoiceFeeRate) / 100))}`,
      created_by:  null,
    })
    const next = invoiceInvestorIdx + 1
    if (next < investors.length) {
      setInvoiceInvestorIdx(next)
      setInvoiceFeeRate(String(investors[next].feeRate || 5))
    } else {
      setShowInvoiceCard(false)
    }
  }

  // ── Render ──
  const wideLayout = step >= 1 && step <= 3

  return (
    <div style={{ maxWidth: wideLayout ? 960 : 720 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/deals" style={{ color: '#888', textDecoration: 'none' }}>Deals</Link>
        {' › '}New deal
      </div>
      <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 24 }}>New deal</h1>
      <StepBar current={step} />

      {step === 0 && (
        <DealSetupStep
          dealType={dealType} setDealType={setDealType}
          companyId={companyId} setCompanyId={setCompanyId}
          shareClass={shareClass} setShareClass={setShareClass}
          amount={amount} setAmount={setAmount}
          sharePrice={sharePrice} setSharePrice={setSharePrice}
          investmentDate={investmentDate} setInvestmentDate={setInvestmentDate}
          eisQualifying={eisQualifying} setEisQualifying={setEisQualifying}
          investors={investors} setInvestors={setInvestors}
          clientSearch={clientSearch} setClientSearch={setClientSearch}
          checklist={checklist} setChecklist={setChecklist}
          companies={companies} clients={clients}
          error={error} saving={saving}
          onNext={handleStep1Next}
        />
      )}

      {step === 1 && (
        <DocumentsStep
          documents={documents} setDocuments={setDocuments}
          reminderDays={reminderDays} setReminderDays={setReminderDays}
          signingOrder={signingOrder} setSigningOrder={setSigningOrder}
          investors={investors}
          selectedCompany={selectedCompany}
          investmentDate={investmentDate}
          onNext={handleStep2Next}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <SendStep
          documents={documents} investors={investors}
          emailSubject={emailSubject} setEmailSubject={setEmailSubject}
          emailMessage={emailMessage} setEmailMessage={setEmailMessage}
          signingOrder={signingOrder} reminderDays={reminderDays}
          error={error} saving={saving}
          onSend={handleSend}
          onBack={() => setStep(1)}
          onEditDocs={() => setStep(1)}
        />
      )}

      {step === 3 && dealId && (
        <TrackStep
          dealId={dealId}
          investors={investors}
          documents={documents}
          sentDate={sentDate}
          companyId={companyId}
          companyName={selectedCompany?.name ?? ''}
          amount={amount}
          isInvestmentDeal={isInvestmentDeal}
          showInvoiceCard={showInvoiceCard}
          invoiceInvestorIdx={invoiceInvestorIdx}
          invoiceFeeRate={invoiceFeeRate}
          invoicesSaved={invoicesSaved}
          onInvoiceRateChange={setInvoiceFeeRate}
          onInvoiceConfirm={handleInvoiceConfirm}
          onInvoiceSkip={() => {
            const next = invoiceInvestorIdx + 1
            if (next < investors.length) {
              setInvoiceInvestorIdx(next)
              setInvoiceFeeRate(String(investors[next].feeRate || 5))
            } else {
              setShowInvoiceCard(false)
            }
          }}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && dealId && (
        <CompleteStep
          dealId={dealId}
          investors={investors}
          checklist={checklist}
          companyId={companyId}
          companyName={selectedCompany?.name ?? ''}
          eisQualifying={eisQualifying}
          onDone={() => router.push(`/deals/${dealId}`)}
        />
      )}
    </div>
  )
}
