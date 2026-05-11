import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { SupabaseClient } from '@supabase/supabase-js'
import { templateRegistry } from './templateRegistry'
import { fetchDealContext } from './contexts/fetchDealContext'
import type {
  TemplateId, ContextFor, GenerationOptions, GenerationResult,
  DealDocumentContext, ContextDomain,
} from './types'

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateDocument<T extends TemplateId>(
  supabase: SupabaseClient,
  templateId: T,
  context: ContextFor<T>,
  options: GenerationOptions = {},
): Promise<GenerationResult> {
  const entry = templateRegistry[templateId]
  if (!entry) throw new Error(`Template not found in registry: ${templateId}`)

  // 1. Fetch the domain context
  const domainContext = await fetchContextForDomain(supabase, entry.domain, context)

  // 2. Render the React PDF component to a buffer.
  // Cast needed because TypeScript can't prove through the generic that the
  // component's return type satisfies DocumentProps — guaranteed by convention
  // (every template must return <Document> as its root element).
  const TemplateComponent = entry.component
  const element = React.createElement(TemplateComponent, domainContext)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any)

  // Preview-only mode: return buffer + context without uploading or creating a row.
  // Used by the Review-before-send modal for inline PDF preview.
  if (options.previewOnly) {
    return {
      documentId: '',
      storageUrl: '',
      templateVersion: `${templateId}@${entry.version}`,
      pdfBuffer,
      context: domainContext,
    }
  }

  // 3. Build storage path (immutable — never overwrite existing documents)
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  const filename = `${templateId}-${Date.now()}-${suffix}.pdf`
  const storagePath = `deals/${domainContext.deal.id}/${filename}`

  // 4. Upload to Supabase Storage (private bucket, path stored — not public URL)
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,  // immutable: never overwrite
    })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  // 5. Create a documents row — records the generation event permanently
  const templateVersion = `${templateId}@${entry.version}`
  const { data: docRow, error: insertError } = await supabase
    .from('documents')
    .insert({
      deal_id: domainContext.deal.id,
      client_id: domainContext.investor.client_id,
      deal_investor_id: domainContext.investment.deal_investor_id,
      type: entry.documentType,
      filename,
      storage_url: storagePath,
      template_version: templateVersion,
      version: 1,
      superseded: false,
    })
    .select('id')
    .single()

  if (insertError) throw new Error(`Documents insert failed: ${insertError.message}`)

  return {
    documentId: docRow.id,
    storageUrl: storagePath,
    templateVersion,
    pdfBuffer,
    context: domainContext,
  }
}

// ── Context dispatch ───────────────────────────────────────────────────────────

async function fetchContextForDomain(
  supabase: SupabaseClient,
  domain: ContextDomain,
  input: Record<string, unknown>,
): Promise<DealDocumentContext> {
  switch (domain) {
    case 'deal':
      return fetchDealContext(supabase, input as { dealInvestorId: string })
    case 'client':
      throw new Error('Client context not yet implemented (Stage 6d)')
    case 'portfolio':
      throw new Error('Portfolio context not yet implemented')
  }
}
