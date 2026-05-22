import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EmailTemplatesList } from './EmailTemplatesList'

export default async function EmailTemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, document_type, subject, body, is_default, updated_at, updated_by')
    .order('document_type')

  return (
    <div style={{ maxWidth: 840 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/settings" style={{ color: '#888', textDecoration: 'none' }}>Settings</Link>
        {' › '}Email templates
      </div>

      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Email templates</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Edit the default email subject and body used when sending each document type.
          Changes take effect immediately for all new sends.
        </p>
      </div>

      <EmailTemplatesList templates={templates ?? []} />
    </div>
  )
}
