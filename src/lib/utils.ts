export function formatCurrency(amount: number | null | undefined, compact = false): string {
  if (amount == null) return '—'
  if (compact && Math.abs(amount) >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(1)}m`
  }
  if (compact && Math.abs(amount) >= 1_000) {
    return `£${(amount / 1_000).toFixed(0)}k`
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('')
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function calcGainLoss(invested: number, currentValue: number) {
  const change = currentValue - invested
  const pct = invested > 0 ? (change / invested) * 100 : 0
  return { change, pct }
}
