'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { Breadcrumb } from '@/components/Breadcrumb'
import type { Client } from '@/types'
import ClientHeader from './ClientHeader'
import StatusStrip from './StatusStrip'
import HeadlineStats from './HeadlineStats'
import EntityFilter from './EntityFilter'
import ClientTabs, { type TabKey } from './ClientTabs'
import OverviewTab from './tabs/OverviewTab'
import InvestmentsTab from './tabs/InvestmentsTab'
import InvestmentDocsTab from './tabs/InvestmentDocsTab'
import UpdatesSentTab from './tabs/UpdatesSentTab'
import NotesTab from './tabs/NotesTab'

export interface InvestmentRecord {
  id: string
  client_id: string
  company_id: string
  share_class: string
  investment_date: string
  original_share_price: number
  shares_purchased: number
  sum_subscribed: number
  eis_status: string
  holding_location: string
  holding_entity: string | null
  status: string
  transaction_type: string | null
  fund_type: string | null
}

export interface NoteRecord {
  id: string
  client_id: string
  note_text: string
  flag_for_followup: boolean
  created_by: string | null
  created_at: string
}

export interface DocumentRecord {
  id: string
  client_id: string
  type: string
  filename: string
  storage_url: string | null
  document_date: string | null
}

export interface ValuationRecord {
  company_id: string
  share_price: number
  valuation_date: string
}

interface Props {
  lead: Client
  linkedEntities: Client[]
  investments: InvestmentRecord[]
  notes: NoteRecord[]
  documents: DocumentRecord[]
  valuations: ValuationRecord[]
}

const VALID_TABS: TabKey[] = ['overview', 'investments', 'investment_docs', 'updates_sent', 'notes']

// Entity type display order: own_name first, then corporate, pension, family, trust
const ENTITY_TYPE_ORDER: Record<string, number> = {
  own_name: 0, corporate: 1, pension: 2, family: 3, trust: 4,
}

export default function ClientRecord({
  lead, linkedEntities, investments, notes, documents, valuations,
}: Props) {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const rawTab      = searchParams.get('tab')
  const activeTab   = (VALID_TABS.includes(rawTab as TabKey) ? rawTab : 'overview') as TabKey
  const selectedEntity = searchParams.get('entity') ?? 'all'

  function navigate(tab: TabKey, entity: string) {
    router.push(`?tab=${tab}&entity=${entity}`, { scroll: false })
  }

  // Sort linked entities: by entity_type order, then alphabetically within type
  const sortedLinkedEntities = useMemo(
    () =>
      [...linkedEntities].sort((a, b) => {
        const ao = ENTITY_TYPE_ORDER[a.entity_type] ?? 99
        const bo = ENTITY_TYPE_ORDER[b.entity_type] ?? 99
        if (ao !== bo) return ao - bo
        return a.full_name.localeCompare(b.full_name)
      }),
    [linkedEntities],
  )

  // Investments filtered to the selected entity scope
  const filteredInvestments = useMemo(
    () =>
      selectedEntity === 'all'
        ? investments
        : investments.filter(i => i.client_id === selectedEntity),
    [investments, selectedEntity],
  )

  // All entity IDs (lead + linked) — used in HeadlineStats entity count computation
  const allEntityIds = useMemo(
    () => [lead.id, ...sortedLinkedEntities.map(e => e.id)],
    [lead.id, sortedLinkedEntities],
  )

  // Scope entity IDs: all when filter is 'all', else just the selected entity
  const scopeEntityIds = selectedEntity === 'all' ? allEntityIds : [selectedEntity]

  return (
    <div>
      <Breadcrumb items={[{ label: 'Clients', href: '/clients' }, { label: lead.full_name }]} />

      {/* Header card — avatar, name, meta row, actions + status strip inside */}
      <div
        style={{
          background: '#fff', border: '0.5px solid #e8e7e0',
          borderRadius: 8, padding: '18px 20px', marginBottom: 14,
        }}
      >
        <ClientHeader lead={lead} linkedEntityCount={linkedEntities.length} />
        <StatusStrip lead={lead} notes={notes} documents={documents} />
      </div>

      <HeadlineStats
        investments={filteredInvestments}
        valuations={valuations}
        scopeEntityIds={scopeEntityIds}
        notes={notes}
        documents={documents}
        lead={lead}
      />

      <EntityFilter
        lead={lead}
        linkedEntities={sortedLinkedEntities}
        allInvestments={investments}
        selectedEntity={selectedEntity}
        onSelect={entity => navigate(activeTab, entity)}
      />

      <ClientTabs
        activeTab={activeTab}
        onTabChange={tab => navigate(tab, selectedEntity)}
        investmentCount={filteredInvestments.length}
        investmentDocsCount={0}
        updatesSentCount={0}
        notesCount={notes.length}
      />

      <div style={{ paddingTop: 16 }}>
        {activeTab === 'overview'        && <OverviewTab lead={lead} />}
        {activeTab === 'investments'     && <InvestmentsTab />}
        {activeTab === 'investment_docs' && <InvestmentDocsTab />}
        {activeTab === 'updates_sent'    && <UpdatesSentTab />}
        {activeTab === 'notes'           && <NotesTab />}
      </div>
    </div>
  )
}
