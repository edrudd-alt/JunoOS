export interface EmailTemplateContext {
  clientFirstName: string
  periodDateFormatted: string
}

export function deriveClientFirstName(fullName: string): string {
  const trimmed = fullName.trim()
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) return trimmed || '[Client first name]'
  return trimmed.substring(0, firstSpace) || '[Client first name]'
}

export function formatPeriodDateUK(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (isNaN(d.getTime())) return '[Period date]'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export const PORTFOLIO_STATEMENT_SUBJECT_TEMPLATE = (ctx: EmailTemplateContext) =>
  `Portfolio statement as at ${ctx.periodDateFormatted}`

export const PORTFOLIO_STATEMENT_BODY_TEMPLATE = (ctx: EmailTemplateContext) =>
  `Dear ${ctx.clientFirstName},

Please find attached your portfolio valuation statement as at ${ctx.periodDateFormatted}.

The statement covers your holdings across all entities and includes per-lot performance and a summary by company. If you have any questions, please get in touch.

Kind regards,
Juno Capital Partners LLP`
