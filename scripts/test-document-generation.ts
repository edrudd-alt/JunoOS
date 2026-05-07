/**
 * End-to-end test for the document generation service.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-document-generation.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (service role bypasses RLS).
 * Test subject: Bob Bigballs / Cyclr 2020 Seed — real Supabase data, confirmed_amount £100,000.
 */
import { createClient } from '@supabase/supabase-js'
import { generateDocument } from '../src/services/document-generation'
import { writeFileSync } from 'fs'
import { join } from 'path'

const TEST_DEAL_INVESTOR_ID = '588470cc-38ae-4017-aba3-a9aa333a5186'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log('Generating helloWorld document...')
  console.log(`  deal_investor_id: ${TEST_DEAL_INVESTOR_ID}`)
  console.log(`  investor:         Bob Bigballs / Cyclr 2020 Seed (£100,000)`)

  const result = await generateDocument(supabase, 'helloWorld', {
    dealInvestorId: TEST_DEAL_INVESTOR_ID,
  })

  console.log('\n✓ generateDocument returned')
  console.log(`  documentId:       ${result.documentId}`)
  console.log(`  storageUrl:       ${result.storageUrl}`)
  console.log(`  templateVersion:  ${result.templateVersion}`)
  console.log(`  pdfBuffer:        ${result.pdfBuffer.length.toLocaleString()} bytes`)

  // Save locally so you can open it for visual inspection
  const outPath = join(process.cwd(), 'scripts', 'test-output.pdf')
  writeFileSync(outPath, result.pdfBuffer)
  console.log(`  saved to:         scripts/test-output.pdf`)

  // Verify the documents row was written correctly
  const { data: docRow, error: docError } = await supabase
    .from('documents')
    .select('id, deal_id, client_id, deal_investor_id, type, filename, storage_url, template_version, version, superseded')
    .eq('id', result.documentId)
    .single()

  if (docError || !docRow) {
    console.error('\n✗ documents row not found:', docError?.message)
    process.exit(1)
  }

  console.log('\n✓ documents row verified')
  console.log(`  type:             ${docRow.type}`)
  console.log(`  template_version: ${docRow.template_version}`)
  console.log(`  version:          ${docRow.version}`)
  console.log(`  superseded:       ${docRow.superseded}`)
  console.log(`  storage_url:      ${docRow.storage_url}`)

  // Verify the storage object is actually downloadable (confirms policy is live)
  const { data: download, error: downloadError } = await supabase.storage
    .from('documents')
    .download(result.storageUrl)

  if (downloadError || !download) {
    console.error('\n✗ storage download failed:', downloadError?.message)
    process.exit(1)
  }

  const downloadedSize = (download as Blob).size
  console.log('\n✓ storage object downloadable')
  console.log(`  downloaded size:  ${downloadedSize.toLocaleString()} bytes`)

  if (downloadedSize !== result.pdfBuffer.length) {
    console.error(`\n✗ size mismatch: generated=${result.pdfBuffer.length} downloaded=${downloadedSize}`)
    process.exit(1)
  }

  console.log('\n✓ size matches — all checks passed.\n')
}

main().catch(err => {
  console.error('\nTest failed:', err)
  process.exit(1)
})
