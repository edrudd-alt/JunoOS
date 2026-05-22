import Link from 'next/link'
import { getOutlookConnectionStatus } from '@/app/(app)/settings/outlookActions'
import OutlookCard from './OutlookCard'

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; outlook_error?: string }>
}) {
  const params = await searchParams
  const status = await getOutlookConnectionStatus()

  const successBanner = params.connected === 'outlook'
  const errorMessage  = params.outlook_error
    ? params.outlook_error === 'denied'
      ? 'Outlook connection was cancelled.'
      : params.outlook_error === 'invalid'
        ? 'The Outlook connection request was invalid — please try again.'
        : decodeURIComponent(params.outlook_error)
    : null

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        <Link href="/settings" style={{ color: '#888', textDecoration: 'none' }}>Settings</Link>
        {' › '}Integrations
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>Integrations</h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Connect external services to JunoOS</p>
      </div>

      {successBanner && (
        <div style={{
          background: '#e1f5ee',
          border: '0.5px solid #1d9e75',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: '#085041',
          marginBottom: 16,
        }}>
          Outlook connected successfully.
        </div>
      )}

      {errorMessage && (
        <div style={{
          background: '#fdf0ef',
          border: '0.5px solid #c0392b',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: '#c0392b',
          marginBottom: 16,
        }}>
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <OutlookCard status={status} />
      </div>
    </div>
  )
}
