import { createClient } from '@/lib/supabase/server'
import {
  getCompaniesWithShareClasses,
  getLatestValuationsPerClass,
  getEarliestInvestmentDatePerClass,
} from './_lib/queries'
import SharePricesClient from './SharePricesClient'

interface Props {
  searchParams: Promise<{ company?: string }>
}

export default async function SharePricesPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { company: highlightCompanyId } = await searchParams

  const { companies } = await getCompaniesWithShareClasses(supabase)
  const allClassIds   = companies.flatMap(c => c.classes.map(cl => cl.id))

  const [latestValuations, earliestInvestments] = await Promise.all([
    getLatestValuationsPerClass(supabase, allClassIds),
    getEarliestInvestmentDatePerClass(supabase, allClassIds),
  ])

  return (
    <SharePricesClient
      companies={companies}
      latestValuations={Object.fromEntries(latestValuations)}
      earliestInvestments={Object.fromEntries(earliestInvestments)}
      highlightCompanyId={highlightCompanyId}
    />
  )
}
