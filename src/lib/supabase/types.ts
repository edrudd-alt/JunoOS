export type KycStatus = 'verified' | 'renewal_due' | 'outstanding'
export type TaxStatus = 'eis' | 'seis' | 'both' | 'neither'
export type EntityType = 'own_name' | 'family' | 'corporate'
export type HoldingLocation = 'direct' | 'nominee' | 'both'
export type EisStatus = 'yes' | 'no' | 'tbc'
export type InvestmentStatus = 'active' | 'pending' | 'exited'
export type DealType = 'new_investment' | 'follow_on' | 'exit' | 'kyc' | 'side_letter' | 'membership'
export type DealStatus = 'draft' | 'sent' | 'partially_signed' | 'fully_signed' | 'complete'
export type DocumentType =
  | 'board_minutes' | 'management_accounts' | 'call_notes' | 'ceo_update'
  | 'kpi_spreadsheet' | 'press_release' | 'application_form' | 'eis_certificate'
  | 'transaction_statement' | 'investment_agreement' | 'side_letter' | 'invoice'
  | 'kyc' | 'poa' | 'membership_agreement' | 'suitability_assessment'
  | 'source_of_funds' | 'portfolio_statement' | 'company_update' | 'exit_statement' | 'other'

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          full_name: string
          investor_reference: string | null
          email: string | null
          phone: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          postcode: string | null
          date_joined: string | null
          tax_status: TaxStatus
          kyc_status: KycStatus
          kyc_expiry: string | null
          default_fee_rate: number
          report_delivery_email: string | null
          lead_investor_id: string | null
          entity_type: EntityType
          holding_location: HoldingLocation
          reporting_entity_defaults: string[]
          report_delivery_method: 'email' | 'download_only'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      companies: {
        Row: {
          id: string
          name: string
          sector: string | null
          stage: string | null
          eis_eligible: boolean
          logo_url: string | null
          website: string | null
          description: string | null
          share_classes: unknown
          kpi_config: unknown
          update_template: unknown
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      investments: {
        Row: {
          id: string
          client_id: string
          company_id: string
          share_class: string
          investment_date: string
          original_share_price: number
          shares_purchased: number
          sum_subscribed: number
          eis_status: EisStatus
          holding_entity: string | null
          holding_location: 'direct' | 'nominee'
          status: InvestmentStatus
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['investments']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['investments']['Insert']>
      }
      valuations: {
        Row: {
          id: string
          company_id: string
          share_price: number
          valuation_date: string
          updated_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['valuations']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['valuations']['Insert']>
      }
      documents: {
        Row: {
          id: string
          type: DocumentType
          company_id: string | null
          client_id: string | null
          deal_id: string | null
          filename: string
          storage_url: string | null
          onedrive_url: string | null
          period: string | null
          document_date: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
      }
      client_notes: {
        Row: {
          id: string
          client_id: string
          note_text: string
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['client_notes']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['client_notes']['Insert']>
      }
      team_members: {
        Row: {
          id: string
          full_name: string | null
          initials: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['team_members']['Row'], 'created_at'> & {
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
      }
    }
    Views: {
      company_current_valuations: {
        Row: {
          company_id: string
          share_price: number
          valuation_date: string
        }
      }
      client_portfolio_summary: {
        Row: {
          client_id: string
          company_id: string
          company_name: string
          sector: string | null
          total_invested: number
          total_shares: number
          transaction_count: number
          current_value: number
          gain_loss: number
        }
      }
    }
  }
}
