import { HelloWorldTemplate, helloWorldVersion } from './templates/helloWorld'
import type { ContextDomain, TemplateId, DealDocumentContext } from './types'

export interface RegistryEntry {
  component: React.ComponentType<DealDocumentContext>
  version: string
  domain: ContextDomain
  documentType: string  // maps to documents.type column
}

export const templateRegistry: Record<TemplateId, RegistryEntry> = {
  helloWorld: {
    component: HelloWorldTemplate,
    version: helloWorldVersion,
    domain: 'deal',
    documentType: 'other',
  },
  // Stage 6b: applicationForm: { component: ApplicationFormTemplate, version: ..., domain: 'deal', documentType: 'application_form' }
  // Stage 6c: transactionStatement: { component: TransactionStatementTemplate, version: ..., domain: 'deal', documentType: 'transaction_statement' }
}
