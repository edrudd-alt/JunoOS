// ─── PDF generation service (application form placeholder) ────────────────────
// Replace generateApplicationForm with a real implementation when ready.
// Options: react-pdf, pdf-lib, Puppeteer server action, or an external API.

export interface ApplicationFormInvestor {
  name:       string
  email:      string
  shares:     number
  cost:       number
  feePayable: number
  totalCost:  number
  eisStatus:  string
  shareClass: string
}

export interface ApplicationFormData {
  companyName:    string
  dealType:       string
  shareClass:     string
  sharePrice:     number
  investmentDate: string
  eisQualifying:  string
  investors:      ApplicationFormInvestor[]
}

/**
 * Generate an application form PDF for a deal.
 * Returns a Blob that can be downloaded or uploaded to storage.
 */
export async function generateApplicationForm(
  _data: ApplicationFormData,
): Promise<Blob> {
  // TODO: implement PDF generation
  throw new Error('PDF service not yet configured. Implement generateApplicationForm in pdfService.ts')
}
