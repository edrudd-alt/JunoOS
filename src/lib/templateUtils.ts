// Pure template utilities — no 'use server'. Safe to import in client or server code.

export function deriveFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0] ?? ''
}

// Backward-compat alias
export const deriveClientFirstName = deriveFirstName

export function formatPeriodDateUK(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Used by bulk-send runs. Handles both legacy {{first_name}} and new {{client_first_name}}.
export function substituteBulkTemplate(
  template: string,
  ctx: { clientFirstName: string; periodDateFormatted: string },
): string {
  return template
    .replace(/\{\{client_first_name\}\}/g, ctx.clientFirstName)
    .replace(/\{\{first_name\}\}/g, ctx.clientFirstName)
    .replace(/\{\{period\}\}/g, ctx.periodDateFormatted)
}
