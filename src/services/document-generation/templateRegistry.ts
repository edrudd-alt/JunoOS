import { HelloWorldTemplate, helloWorldVersion } from './templates/helloWorld'
import { ApplicationFormTemplate, applicationFormVersion } from './templates/applicationForm'
import { ApplicationFormV1_1Template, applicationFormV1_1Version } from './templates/applicationFormV1_1'
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
  applicationForm: {
    component: ApplicationFormTemplate,
    version: applicationFormVersion,
    domain: 'deal',
    documentType: 'application_form',
  },
  applicationFormV1_1: {
    component: ApplicationFormV1_1Template,
    version: applicationFormV1_1Version,
    domain: 'deal',
    documentType: 'application_form',
  },
  // Stage 6c: transactionStatement: { component: TransactionStatementTemplate, version: ..., domain: 'deal', documentType: 'transaction_statement' }
}
