import { createClient } from '@/lib/supabase/server'
import PortfolioList from './PortfolioList'

export default async function PortfolioPage() {
  const supabase = await createClient()

  // All companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, sector, stage, eis_eligible, logo_url')
    .order('name')

  // Current valuations
  const { data: valuations } = await supabase
    .from('company_current_valuations')
    .select('company_id, share_price, valuation_date')

  // Portfolio summaries grouped by company
  const { data: portfolioRows } = await supabase
    .from('client_portfolio_summary')
    .select('company_id, client_id, total_invested, current_value, gain_loss')

  // Investor counts per company
  const investorCounts: Record<string, Set<string>> = {}
  for (const row of portfolioRows ?? []) {
    const cid = row.company_id as string
    if (!investorCounts[cid]) investorCounts[cid] = new Set()
    investorCounts[cid].add(row.client_id as string)
  }

  // Aggregate per company
  const portfolioByCompany: Record<string, {
    totalInvested: number
    currentValue: number
    gainLoss: number
    investorCount: number
  }> = {}

  for (const row of portfolioRows ?? []) {
    const cid = row.company_id as string
    if (!portfolioByCompany[cid]) {
      portfolioByCompany[cid] = {
        totalInvested: 0,
        currentValue: 0,
        gainLoss: 0,
        investorCount: investorCounts[cid]?.size ?? 0,
      }
    }
    portfolioByCompany[cid].totalInvested += Number(row.total_invested ?? 0)
    portfolioByCompany[cid].currentValue += Number(row.current_value ?? 0)
    portfolioByCompany[cid].gainLoss += Number(row.gain_loss ?? 0)
  }

  // Latest KPIs per company (top 2)
  const { data: kpiData } = await supabase
    .from('kpi_data')
    .select('company_id, kpi_name, value, unit, period_date')
    .order('period_date', { ascending: false })

  // Get latest value per kpi_name per company
  const kpiByCompany: Record<string, { name: string; value: number; unit: string | null }[]> = {}
  const seen = new Set<string>()
  for (const row of kpiData ?? []) {
    const key = `${row.company_id}::${row.kpi_name}`
    if (seen.has(key)) continue
    seen.add(key)
    const cid = row.company_id as string
    if (!kpiByCompany[cid]) kpiByCompany[cid] = []
    if (kpiByCompany[cid].length < 2) {
      kpiByCompany[cid].push({
        name: row.kpi_name as string,
        value: Number(row.value),
        unit: row.unit as string | null,
      })
    }
  }

  const valuationMap: Record<string, { share_price: number; valuation_date: string }> = {}
  for (const v of valuations ?? []) {
    valuationMap[v.company_id as string] = {
      share_price: Number(v.share_price),
      valuation_date: v.valuation_date as string,
    }
  }

  return (
    <PortfolioList
      companies={companies ?? []}
      portfolioByCompany={portfolioByCompany}
      valuationMap={valuationMap}
      kpiByCompany={kpiByCompany}
    />
  )
}
