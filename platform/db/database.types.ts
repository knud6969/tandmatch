
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_anon_user_usage_daily": {
                  Row: {
                    "calls": number,"day": string,"user_id": string
                  }
                  Insert: {
                    "calls"?: number,"day": string,"user_id": string
                  }
                  Update: {
                    "calls"?: number,"day"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_anon_user_usage_daily_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_conversations": {
                  Row: {
                    "ai_consent_id": string,"case_id": string,"created_at": string,"id": string,"model": string | null,"patient_id": string,"prompt_version": string | null,"status": Database["public"]['Enums']["conversation_status"],"user_message_count": number
                  }
                  Insert: {
                    "ai_consent_id": string,"case_id": string,"created_at"?: string,"id"?: string,"model"?: string | null,"patient_id": string,"prompt_version"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"user_message_count"?: number
                  }
                  Update: {
                    "ai_consent_id"?: string,"case_id"?: string,"created_at"?: string,"id"?: string,"model"?: string | null,"patient_id"?: string,"prompt_version"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"user_message_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_conversations_ai_consent_id_fkey"
      columns: ["ai_consent_id"]
isOneToOne: false
      referencedRelation: "consents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_conversations_case_id_fkey"
      columns: ["case_id"]
isOneToOne: true
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_conversations_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_limits": {
                  Row: {
                    "key": string,"value": number
                  }
                  Insert: {
                    "key": string,"value": number
                  }
                  Update: {
                    "key"?: string,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ai_messages": {
                  Row: {
                    "blocked": boolean,"content": string,"conversation_id": string,"created_at": string,"emergency": boolean,"id": string,"out_of_scope": (Database["public"]['Enums']["out_of_scope_topic"])[],"patient_id": string,"preliminary_assessment": string | null,"ready_for_summary": boolean,"role": Database["public"]['Enums']["ai_message_role"],"suggested_service_ids": (string)[]
                  }
                  Insert: {
                    "blocked"?: boolean,"content": string,"conversation_id": string,"created_at"?: string,"emergency"?: boolean,"id"?: string,"out_of_scope"?: (Database["public"]['Enums']["out_of_scope_topic"])[],"patient_id": string,"preliminary_assessment"?: string | null,"ready_for_summary"?: boolean,"role": Database["public"]['Enums']["ai_message_role"],"suggested_service_ids"?: (string)[]
                  }
                  Update: {
                    "blocked"?: boolean,"content"?: string,"conversation_id"?: string,"created_at"?: string,"emergency"?: boolean,"id"?: string,"out_of_scope"?: (Database["public"]['Enums']["out_of_scope_topic"])[],"patient_id"?: string,"preliminary_assessment"?: string | null,"ready_for_summary"?: boolean,"role"?: Database["public"]['Enums']["ai_message_role"],"suggested_service_ids"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "ai_conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_messages_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_patient_usage_daily": {
                  Row: {
                    "chat_messages": number,"day": string,"image_turns": number,"patient_id": string,"summary_generations": number
                  }
                  Insert: {
                    "chat_messages"?: number,"day": string,"image_turns"?: number,"patient_id": string,"summary_generations"?: number
                  }
                  Update: {
                    "chat_messages"?: number,"day"?: string,"image_turns"?: number,"patient_id"?: string,"summary_generations"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_patient_usage_daily_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage_daily": {
                  Row: {
                    "anonymous_calls": number,"day": string
                  }
                  Insert: {
                    "anonymous_calls"?: number,"day": string
                  }
                  Update: {
                    "anonymous_calls"?: number,"day"?: string
                  }
                  Relationships: [
                    
                  ]
                },"anonymous_claims": {
                  Row: {
                    "anon_id": string,"claimed_at": string | null,"claimed_by": string | null,"claimed_case_id": string | null,"created_at": string,"expires_at": string,"token_hash": string
                  }
                  Insert: {
                    "anon_id": string,"claimed_at"?: string | null,"claimed_by"?: string | null,"claimed_case_id"?: string | null,"created_at"?: string,"expires_at": string,"token_hash": string
                  }
                  Update: {
                    "anon_id"?: string,"claimed_at"?: string | null,"claimed_by"?: string | null,"claimed_case_id"?: string | null,"created_at"?: string,"expires_at"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bookings": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": Database["public"]['Enums']["booking_actor"] | null,"clinic_id": string,"completed_at": string | null,"contact_email": string,"contact_name": string,"contact_phone": string,"created_at": string,"ends_at": string,"hold_expires_at": string | null,"id": string,"lead_id": string,"no_show_at": string | null,"patient_id": string,"service_id": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
                  }
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["booking_actor"] | null,"clinic_id": string,"completed_at"?: string | null,"contact_email": string,"contact_name": string,"contact_phone": string,"created_at"?: string,"ends_at": string,"hold_expires_at"?: string | null,"id"?: string,"lead_id": string,"no_show_at"?: string | null,"patient_id": string,"service_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["booking_actor"] | null,"clinic_id"?: string,"completed_at"?: string | null,"contact_email"?: string,"contact_name"?: string,"contact_phone"?: string,"created_at"?: string,"ends_at"?: string,"hold_expires_at"?: string | null,"id"?: string,"lead_id"?: string,"no_show_at"?: string | null,"patient_id"?: string,"service_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"case_images": {
                  Row: {
                    "ai_described_at": string | null,"ai_description": string | null,"ai_quality": Database["public"]['Enums']["image_quality"] | null,"ai_turn_at": string | null,"ai_view": Database["public"]['Enums']["image_view"] | null,"bytes": number,"case_id": string,"consent_id": string,"created_at": string,"height": number,"id": string,"patient_id": string,"storage_path": string,"width": number
                  }
                  Insert: {
                    "ai_described_at"?: string | null,"ai_description"?: string | null,"ai_quality"?: Database["public"]['Enums']["image_quality"] | null,"ai_turn_at"?: string | null,"ai_view"?: Database["public"]['Enums']["image_view"] | null,"bytes": number,"case_id": string,"consent_id": string,"created_at"?: string,"height": number,"id"?: string,"patient_id": string,"storage_path": string,"width": number
                  }
                  Update: {
                    "ai_described_at"?: string | null,"ai_description"?: string | null,"ai_quality"?: Database["public"]['Enums']["image_quality"] | null,"ai_turn_at"?: string | null,"ai_view"?: Database["public"]['Enums']["image_view"] | null,"bytes"?: number,"case_id"?: string,"consent_id"?: string,"created_at"?: string,"height"?: number,"id"?: string,"patient_id"?: string,"storage_path"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "case_images_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "case_images_consent_id_fkey"
      columns: ["consent_id"]
isOneToOne: false
      referencedRelation: "consents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "case_images_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"case_services": {
                  Row: {
                    "case_id": string,"confirmed_at": string,"service_id": string,"suggested_by_ai": boolean
                  }
                  Insert: {
                    "case_id": string,"confirmed_at"?: string,"service_id": string,"suggested_by_ai"?: boolean
                  }
                  Update: {
                    "case_id"?: string,"confirmed_at"?: string,"service_id"?: string,"suggested_by_ai"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "case_services_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "case_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"cases": {
                  Row: {
                    "ai_generation_count": number,"ai_model": string | null,"ai_prompt_version": string | null,"ai_summary": Json | null,"closed_at": string | null,"created_at": string,"id": string,"is_emergency": boolean,"patient_id": string,"postal_code": string | null,"preferred_timeframe": Database["public"]['Enums']["case_timeframe"] | null,"sharing_consent_id": string | null,"status": Database["public"]['Enums']["case_status"],"submitted_at": string | null,"summary_ai_assisted": boolean,"summary_approved_at": string | null,"summary_text": string | null,"updated_at": string
                  }
                  Insert: {
                    "ai_generation_count"?: number,"ai_model"?: string | null,"ai_prompt_version"?: string | null,"ai_summary"?: Json | null,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"is_emergency"?: boolean,"patient_id": string,"postal_code"?: string | null,"preferred_timeframe"?: Database["public"]['Enums']["case_timeframe"] | null,"sharing_consent_id"?: string | null,"status"?: Database["public"]['Enums']["case_status"],"submitted_at"?: string | null,"summary_ai_assisted"?: boolean,"summary_approved_at"?: string | null,"summary_text"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "ai_generation_count"?: number,"ai_model"?: string | null,"ai_prompt_version"?: string | null,"ai_summary"?: Json | null,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"is_emergency"?: boolean,"patient_id"?: string,"postal_code"?: string | null,"preferred_timeframe"?: Database["public"]['Enums']["case_timeframe"] | null,"sharing_consent_id"?: string | null,"status"?: Database["public"]['Enums']["case_status"],"submitted_at"?: string | null,"summary_ai_assisted"?: boolean,"summary_approved_at"?: string | null,"summary_text"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cases_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cases_sharing_consent_id_fkey"
      columns: ["sharing_consent_id"]
isOneToOne: false
      referencedRelation: "consents"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_dentists": {
                  Row: {
                    "bio": string | null,"clinic_id": string,"created_at": string,"full_name": string,"id": string,"photo_path": string | null,"photo_updated_at": string | null,"sort_order": number,"title": string | null
                  }
                  Insert: {
                    "bio"?: string | null,"clinic_id": string,"created_at"?: string,"full_name": string,"id"?: string,"photo_path"?: string | null,"photo_updated_at"?: string | null,"sort_order"?: number,"title"?: string | null
                  }
                  Update: {
                    "bio"?: string | null,"clinic_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"photo_path"?: string | null,"photo_updated_at"?: string | null,"sort_order"?: number,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_dentists_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_import_snapshots": {
                  Row: {
                    "address": string,"city": string,"clinic_id": string,"lat": number | null,"lng": number | null,"name": string,"opening_hours": NonNullable<Json>,"phone": string | null,"postal_code": string,"taken_at": string
                  }
                  Insert: {
                    "address": string,"city": string,"clinic_id": string,"lat"?: number | null,"lng"?: number | null,"name": string,"opening_hours"?: NonNullable<Json>,"phone"?: string | null,"postal_code": string,"taken_at"?: string
                  }
                  Update: {
                    "address"?: string,"city"?: string,"clinic_id"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string,"opening_hours"?: NonNullable<Json>,"phone"?: string | null,"postal_code"?: string,"taken_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_import_snapshots_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: true
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_opening_hours": {
                  Row: {
                    "clinic_id": string,"closes_at": string,"created_at": string,"id": string,"is_emergency": boolean,"opens_at": string,"weekday": number
                  }
                  Insert: {
                    "clinic_id": string,"closes_at": string,"created_at"?: string,"id"?: string,"is_emergency"?: boolean,"opens_at": string,"weekday": number
                  }
                  Update: {
                    "clinic_id"?: string,"closes_at"?: string,"created_at"?: string,"id"?: string,"is_emergency"?: boolean,"opens_at"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_opening_hours_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_prices": {
                  Row: {
                    "clinic_id": string,"duration_min": number,"note": string | null,"price_max": number,"price_min": number,"service_id": string,"updated_at": string
                  }
                  Insert: {
                    "clinic_id": string,"duration_min": number,"note"?: string | null,"price_max": number,"price_min": number,"service_id": string,"updated_at"?: string
                  }
                  Update: {
                    "clinic_id"?: string,"duration_min"?: number,"note"?: string | null,"price_max"?: number,"price_min"?: number,"service_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_prices_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_prices_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_service_groups": {
                  Row: {
                    "clinic_id": string,"created_at": string,"group_id": string
                  }
                  Insert: {
                    "clinic_id": string,"created_at"?: string,"group_id": string
                  }
                  Update: {
                    "clinic_id"?: string,"created_at"?: string,"group_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_service_groups_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clinic_service_groups_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "service_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_time_blocks": {
                  Row: {
                    "clinic_id": string,"created_at": string,"ends_at": string,"id": string,"note": string | null,"starts_at": string
                  }
                  Insert: {
                    "clinic_id": string,"created_at"?: string,"ends_at": string,"id"?: string,"note"?: string | null,"starts_at": string
                  }
                  Update: {
                    "clinic_id"?: string,"created_at"?: string,"ends_at"?: string,"id"?: string,"note"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinic_time_blocks_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    }
                  ]
                },"clinics": {
                  Row: {
                    "address": string,"city": string,"created_at": string,"cvr": string | null,"description": string | null,"email": string | null,"id": string,"import_source": string | null,"lat": number | null,"lng": number | null,"logo_path": string | null,"logo_updated_at": string | null,"name": string,"owner_id": string | null,"owner_since": string | null,"phone": string | null,"postal_code": string,"status": Database["public"]['Enums']["clinic_status"],"trustpilot_entered_by": string | null,"trustpilot_review_count": number | null,"trustpilot_score": number | null,"trustpilot_updated_at": string | null,"trustpilot_url": string | null,"updated_at": string,"verified_at": string | null,"website": string | null
                  }
                  Insert: {
                    "address": string,"city": string,"created_at"?: string,"cvr"?: string | null,"description"?: string | null,"email"?: string | null,"id"?: string,"import_source"?: string | null,"lat"?: number | null,"lng"?: number | null,"logo_path"?: string | null,"logo_updated_at"?: string | null,"name": string,"owner_id"?: string | null,"owner_since"?: string | null,"phone"?: string | null,"postal_code": string,"status": Database["public"]['Enums']["clinic_status"],"trustpilot_entered_by"?: string | null,"trustpilot_review_count"?: number | null,"trustpilot_score"?: number | null,"trustpilot_updated_at"?: string | null,"trustpilot_url"?: string | null,"updated_at"?: string,"verified_at"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "address"?: string,"city"?: string,"created_at"?: string,"cvr"?: string | null,"description"?: string | null,"email"?: string | null,"id"?: string,"import_source"?: string | null,"lat"?: number | null,"lng"?: number | null,"logo_path"?: string | null,"logo_updated_at"?: string | null,"name"?: string,"owner_id"?: string | null,"owner_since"?: string | null,"phone"?: string | null,"postal_code"?: string,"status"?: Database["public"]['Enums']["clinic_status"],"trustpilot_entered_by"?: string | null,"trustpilot_review_count"?: number | null,"trustpilot_score"?: number | null,"trustpilot_updated_at"?: string | null,"trustpilot_url"?: string | null,"updated_at"?: string,"verified_at"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clinics_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_text_versions": {
                  Row: {
                    "ai_disclosure": boolean,"retired_at": string | null,"text_version": string,"type": Database["public"]['Enums']["consent_type"]
                  }
                  Insert: {
                    "ai_disclosure"?: boolean,"retired_at"?: string | null,"text_version": string,"type": Database["public"]['Enums']["consent_type"]
                  }
                  Update: {
                    "ai_disclosure"?: boolean,"retired_at"?: string | null,"text_version"?: string,"type"?: Database["public"]['Enums']["consent_type"]
                  }
                  Relationships: [
                    
                  ]
                },"consents": {
                  Row: {
                    "cleanup_done": boolean,"created_at": string,"granted_at": string,"granted_while_anonymous": boolean,"id": string,"patient_id": string,"pending_storage_paths": (string)[] | null,"text_version": string,"type": Database["public"]['Enums']["consent_type"],"withdrawn_at": string | null
                  }
                  Insert: {
                    "cleanup_done"?: boolean,"created_at"?: string,"granted_at"?: string,"granted_while_anonymous"?: boolean,"id"?: string,"patient_id": string,"pending_storage_paths"?: (string)[] | null,"text_version": string,"type": Database["public"]['Enums']["consent_type"],"withdrawn_at"?: string | null
                  }
                  Update: {
                    "cleanup_done"?: boolean,"created_at"?: string,"granted_at"?: string,"granted_while_anonymous"?: boolean,"id"?: string,"patient_id"?: string,"pending_storage_paths"?: (string)[] | null,"text_version"?: string,"type"?: Database["public"]['Enums']["consent_type"],"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consents_text_version_fkey"
      columns: ["text_version"]
isOneToOne: false
      referencedRelation: "consent_text_versions"
      referencedColumns: ["text_version"]
    }
                  ]
                },"leads": {
                  Row: {
                    "case_id": string,"clinic_comment": string | null,"clinic_id": string,"created_at": string,"decline_note": string | null,"decline_reason": Database["public"]['Enums']["lead_decline_reason"] | null,"distance_km": number | null,"id": string,"list_price_max": number | null,"list_price_min": number | null,"quoted_price_max": number | null,"quoted_price_min": number | null,"requested_service_id": string | null,"requested_starts_at": string | null,"responded_at": string | null,"seen_at": string | null,"sent_at": string,"status": Database["public"]['Enums']["lead_status"],"withdrawn_at": string | null
                  }
                  Insert: {
                    "case_id": string,"clinic_comment"?: string | null,"clinic_id": string,"created_at"?: string,"decline_note"?: string | null,"decline_reason"?: Database["public"]['Enums']["lead_decline_reason"] | null,"distance_km"?: number | null,"id"?: string,"list_price_max"?: number | null,"list_price_min"?: number | null,"quoted_price_max"?: number | null,"quoted_price_min"?: number | null,"requested_service_id"?: string | null,"requested_starts_at"?: string | null,"responded_at"?: string | null,"seen_at"?: string | null,"sent_at"?: string,"status"?: Database["public"]['Enums']["lead_status"],"withdrawn_at"?: string | null
                  }
                  Update: {
                    "case_id"?: string,"clinic_comment"?: string | null,"clinic_id"?: string,"created_at"?: string,"decline_note"?: string | null,"decline_reason"?: Database["public"]['Enums']["lead_decline_reason"] | null,"distance_km"?: number | null,"id"?: string,"list_price_max"?: number | null,"list_price_min"?: number | null,"quoted_price_max"?: number | null,"quoted_price_min"?: number | null,"requested_service_id"?: string | null,"requested_starts_at"?: string | null,"responded_at"?: string | null,"seen_at"?: string | null,"sent_at"?: string,"status"?: Database["public"]['Enums']["lead_status"],"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_case_id_fkey"
      columns: ["case_id"]
isOneToOne: false
      referencedRelation: "cases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_requested_service_id_fkey"
      columns: ["requested_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"message_images": {
                  Row: {
                    "bytes": number,"consent_id": string | null,"created_at": string,"height": number,"id": string,"lead_id": string,"message_id": string,"position": number,"storage_path": string,"width": number
                  }
                  Insert: {
                    "bytes": number,"consent_id"?: string | null,"created_at"?: string,"height": number,"id"?: string,"lead_id": string,"message_id": string,"position": number,"storage_path": string,"width": number
                  }
                  Update: {
                    "bytes"?: number,"consent_id"?: string | null,"created_at"?: string,"height"?: number,"id"?: string,"lead_id"?: string,"message_id"?: string,"position"?: number,"storage_path"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_images_consent_id_fkey"
      columns: ["consent_id"]
isOneToOne: false
      referencedRelation: "consents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_images_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_images_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"lead_id": string,"read_at": string | null,"sender_id": string | null,"sender_role": Database["public"]['Enums']["message_sender_role"]
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"lead_id": string,"read_at"?: string | null,"sender_id"?: string | null,"sender_role": Database["public"]['Enums']["message_sender_role"]
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"lead_id"?: string,"read_at"?: string | null,"sender_id"?: string | null,"sender_role"?: Database["public"]['Enums']["message_sender_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"patients": {
                  Row: {
                    "created_at": string,"first_name": string | null,"id": string,"phone": string | null,"postal_code": string | null
                  }
                  Insert: {
                    "created_at"?: string,"first_name"?: string | null,"id": string,"phone"?: string | null,"postal_code"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"first_name"?: string | null,"id"?: string,"phone"?: string | null,"postal_code"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "patients_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"portfolio_items": {
                  Row: {
                    "caption": string | null,"clinic_id": string,"consent_text_version": string,"created_at": string,"dentist_id": string,"id": string,"image_path": string,"patient_consent_confirmed_at": string,"service_id": string | null
                  }
                  Insert: {
                    "caption"?: string | null,"clinic_id": string,"consent_text_version": string,"created_at"?: string,"dentist_id": string,"id"?: string,"image_path": string,"patient_consent_confirmed_at": string,"service_id"?: string | null
                  }
                  Update: {
                    "caption"?: string | null,"clinic_id"?: string,"consent_text_version"?: string,"created_at"?: string,"dentist_id"?: string,"id"?: string,"image_path"?: string,"patient_consent_confirmed_at"?: string,"service_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "portfolio_items_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portfolio_items_dentist_id_fkey"
      columns: ["dentist_id"]
isOneToOne: false
      referencedRelation: "clinic_dentists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portfolio_items_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"postal_codes": {
                  Row: {
                    "city": string,"lat": number,"lng": number,"postal_code": string
                  }
                  Insert: {
                    "city": string,"lat": number,"lng": number,"postal_code": string
                  }
                  Update: {
                    "city"?: string,"lat"?: number,"lng"?: number,"postal_code"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"is_anonymous": boolean,"last_active_at": string,"role": Database["public"]['Enums']["user_role"]
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"is_anonymous"?: boolean,"last_active_at"?: string,"role": Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_anonymous"?: boolean,"last_active_at"?: string,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string
                  }
                  Insert: {
                    "hits"?: number,"key": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_replies": {
                  Row: {
                    "clinic_id": string,"created_at": string,"id": string,"moderated_at": string | null,"moderated_by": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"rejection_reason": string | null,"review_id": string,"text": string
                  }
                  Insert: {
                    "clinic_id": string,"created_at"?: string,"id"?: string,"moderated_at"?: string | null,"moderated_by"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"rejection_reason"?: string | null,"review_id": string,"text": string
                  }
                  Update: {
                    "clinic_id"?: string,"created_at"?: string,"id"?: string,"moderated_at"?: string | null,"moderated_by"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"rejection_reason"?: string | null,"review_id"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_replies_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_replies_moderated_by_fkey"
      columns: ["moderated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_replies_review_id_fkey"
      columns: ["review_id"]
isOneToOne: true
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "actual_price": number | null,"booking_id": string,"clinic_id": string,"created_at": string,"id": string,"lacked_transparency": boolean | null,"moderated_at": string | null,"moderated_by": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"patient_id": string,"price_accuracy": Database["public"]['Enums']["price_accuracy"],"rejection_reason": string | null,"stars": number,"text": string,"transparency_comment": string | null
                  }
                  Insert: {
                    "actual_price"?: number | null,"booking_id": string,"clinic_id": string,"created_at"?: string,"id"?: string,"lacked_transparency"?: boolean | null,"moderated_at"?: string | null,"moderated_by"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"patient_id": string,"price_accuracy": Database["public"]['Enums']["price_accuracy"],"rejection_reason"?: string | null,"stars": number,"text": string,"transparency_comment"?: string | null
                  }
                  Update: {
                    "actual_price"?: number | null,"booking_id"?: string,"clinic_id"?: string,"created_at"?: string,"id"?: string,"lacked_transparency"?: boolean | null,"moderated_at"?: string | null,"moderated_by"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"patient_id"?: string,"price_accuracy"?: Database["public"]['Enums']["price_accuracy"],"rejection_reason"?: string | null,"stars"?: number,"text"?: string,"transparency_comment"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_clinic_id_fkey"
      columns: ["clinic_id"]
isOneToOne: false
      referencedRelation: "clinics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_moderated_by_fkey"
      columns: ["moderated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"service_groups": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"is_active": boolean,"name": string,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "category": Database["public"]['Enums']["service_category"],"created_at": string,"default_duration_min": number,"description": string,"group_id": string,"id": string,"is_active": boolean,"name": string,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "category": Database["public"]['Enums']["service_category"],"created_at"?: string,"default_duration_min": number,"description": string,"group_id": string,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["service_category"],"created_at"?: string,"default_duration_min"?: number,"description"?: string,"group_id"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "service_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"terms_acceptances": {
                  Row: {
                    "accepted_at": string,"created_at": string,"id": string,"privacy_version": string,"terms_version": string,"user_id": string
                  }
                  Insert: {
                    "accepted_at": string,"created_at"?: string,"id"?: string,"privacy_version": string,"terms_version": string,"user_id": string
                  }
                  Update: {
                    "accepted_at"?: string,"created_at"?: string,"id"?: string,"privacy_version"?: string,"terms_version"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "terms_acceptances_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_set_clinic_status":
{ Args: { "p_clinic_id": string,"p_status": Database["public"]['Enums']["clinic_status"] }; Returns: undefined
                           },
"ai_limit":
{ Args: { "p_key": string }; Returns: number
                           },
"append_assistant_message":
{ Args: { "p_blocked": boolean,"p_content": string,"p_conversation_id": string,"p_emergency": boolean,"p_out_of_scope": (string)[],"p_preliminary_assessment": string,"p_ready": boolean,"p_suggested_service_ids": (string)[],"p_user_id": string }; Returns: {
              "blocked": boolean,
"content": string,
"conversation_id": string,
"created_at": string,
"emergency": boolean,
"id": string,
"out_of_scope": (Database["public"]['Enums']["out_of_scope_topic"])[],
"patient_id": string,
"preliminary_assessment": string | null,
"ready_for_summary": boolean,
"role": Database["public"]['Enums']["ai_message_role"],
"suggested_service_ids": (string)[]
            }
                          SetofOptions: {
        from: "*"
        to: "ai_messages"
        isOneToOne: true
        isSetofReturn: false
      } },
"approve_summary":
{ Args: { "p_ai_assisted"?: boolean,"p_case_id": string,"p_summary_text": string }; Returns: string
                           },
"assert_slot_bookable":
{ Args: { "p_clinic_id": string,"p_ends_at": string,"p_service_id": string,"p_starts_at": string }; Returns: undefined
                           },
"auth_clinic_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"book_slot":
{ Args: { "p_contact_name": string,"p_contact_phone": string,"p_lead_id": string,"p_service_id": string,"p_starts_at": string }; Returns: string
                           },
"can_review_booking":
{ Args: { "p_booking_id": string }; Returns: boolean
                           },
"cancel_booking":
{ Args: { "p_booking_id": string,"p_reason"?: string }; Returns: undefined
                           },
"claim_anonymous_case":
{ Args: { "p_token": string }; Returns: Json
                           },
"clinic_booking":
{ Args: { "p_booking_id": string }; Returns: {
              "booking_id": string,"can_mark_no_show": boolean,"cancel_reason": string,"cancelled_by": Database["public"]['Enums']["booking_actor"],"contact_email": string,"contact_name": string,"contact_phone": string,"ends_at": string,"hold_expires_at": string,"lead_id": string,"service_id": string,"service_name": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"clinic_bookings":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "booking_id": string,"can_mark_no_show": boolean,"cancel_reason": string,"cancelled_by": Database["public"]['Enums']["booking_actor"],"contact_email": string,"contact_name": string,"contact_phone": string,"ends_at": string,"hold_expires_at": string,"lead_id": string,"service_id": string,"service_name": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"clinic_decide_lead":
{ Args: { "p_comment"?: string,"p_decision": string,"p_decline_note"?: string,"p_decline_reason"?: Database["public"]['Enums']["lead_decline_reason"],"p_lead_id": string,"p_quoted_max"?: number,"p_quoted_min"?: number }; Returns: undefined
                           },
"clinic_lead_detail":
{ Args: { "p_lead_id": string }; Returns: {
              "booking_ends_at": string,"booking_hold_expires_at": string,"booking_id": string,"booking_service_id": string,"booking_service_name": string,"booking_starts_at": string,"booking_status": Database["public"]['Enums']["booking_status"],"can_mark_no_show": boolean,"city": string,"clinic_comment": string,"contact_email": string,"contact_name": string,"contact_phone": string,"decline_note": string,"decline_reason": Database["public"]['Enums']["lead_decline_reason"],"distance_km": number,"image_count": number,"is_emergency": boolean,"lead_id": string,"list_price_max": number,"list_price_min": number,"postal_code": string,"preferred_timeframe": Database["public"]['Enums']["case_timeframe"],"quoted_price_max": number,"quoted_price_min": number,"requested_service_id": string,"requested_starts_at": string,"responded_at": string,"seen_at": string,"sent_at": string,"services": Json,"status": Database["public"]['Enums']["lead_status"],"summary_ai_assisted": boolean,"summary_text": string,"unread_messages": number,"withdrawn_at": string
            }[]
                           },
"clinic_lead_images":
{ Args: { "p_lead_id": string }; Returns: {
              "approved_description": string,"height": number,"image_id": string,"storage_path": string,"width": number
            }[]
                           },
"clinic_lead_message_images":
{ Args: { "p_lead_id": string }; Returns: {
              "height": number,"id": string,"message_id": string,"position": number,"storage_path": string,"width": number
            }[]
                           },
"clinic_lead_messages":
{ Args: { "p_lead_id": string }; Returns: {
              "body": string,"created_at": string,"from_me": boolean,"id": string,"read_at": string
            }[]
                           },
"clinic_lead_status":
{ Args: { "p_lead_id": string }; Returns: Database["public"]['Enums']["lead_status"]
                           },
"clinic_leads":
{ Args: { "p_status"?: Database["public"]['Enums']["lead_status"] }; Returns: {
              "city": string,"distance_km": number,"hold_expires_at": string,"image_count": number,"is_emergency": boolean,"lead_id": string,"list_price_max": number,"list_price_min": number,"postal_code": string,"preferred_timeframe": Database["public"]['Enums']["case_timeframe"],"requested_starts_at": string,"seen_at": string,"sent_at": string,"service_names": (string)[],"status": Database["public"]['Enums']["lead_status"],"summary_excerpt": string,"unread_messages": number,"withdrawn_at": string
            }[]
                           },
"clinic_mark_lead_seen":
{ Args: { "p_lead_id": string }; Returns: undefined
                           },
"clinic_mark_messages_read":
{ Args: { "p_lead_id": string }; Returns: undefined
                           },
"clinic_reviews":
{ Args: Record<PropertyKey, never>; Returns: {
              "actual_price": number,"created_at": string,"lacked_transparency": boolean,"price_accuracy": Database["public"]['Enums']["price_accuracy"],"reply_created_at": string,"reply_id": string,"reply_status": Database["public"]['Enums']["moderation_status"],"reply_text": string,"review_id": string,"stars": number,"text": string,"transparency_comment": string
            }[]
                           },
"close_case":
{ Args: { "p_case_id": string }; Returns: undefined
                           },
"complete_due_bookings":
{ Args: Record<PropertyKey, never>; Returns: {
              "completed": number,"released_holds": number
            }[]
                           },
"confirm_consent_cleanup":
{ Args: { "p_consent_id": string }; Returns: undefined
                           },
"consume_anonymous_ai_call":
{ Args: { "p_user_id": string }; Returns: string
                           },
"consume_rate_limit":
{ Args: { "p_key": string,"p_limit": number }; Returns: boolean
                           },
"consume_summary_generation":
{ Args: { "p_case_id": string,"p_user_id": string }; Returns: number
                           },
"effective_booking_status":
{ Args: { "p_ends_at": string,"p_hold_expires_at": string,"p_status": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"has_active_consent":
{ Args: { "p_type": Database["public"]['Enums']["consent_type"] }; Returns: boolean
                           },
"haversine_km":
{ Args: { "p_lat1": number,"p_lat2": number,"p_lng1": number,"p_lng2": number }; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_allowed_consent_text":
{ Args: { "p_type": Database["public"]['Enums']["consent_type"],"p_version": string }; Returns: boolean
                           },
"is_case_owner":
{ Args: { "p_case_id": string }; Returns: boolean
                           },
"is_clinic_owner":
{ Args: { "p_clinic_id": string }; Returns: boolean
                           },
"is_cvr_claimed":
{ Args: { "p_cvr": string }; Returns: boolean
                           },
"is_lead_active_status":
{ Args: { "p_status": Database["public"]['Enums']["lead_status"] }; Returns: boolean
                           },
"is_lead_participant":
{ Args: { "p_lead_id": string }; Returns: boolean
                           },
"is_lead_patient":
{ Args: { "p_lead_id": string }; Returns: boolean
                           },
"is_lead_thread_open":
{ Args: { "p_lead_id": string }; Returns: boolean
                           },
"is_my_clinic_lead":
{ Args: { "p_lead_id": string }; Returns: boolean
                           },
"is_permanent_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_phone":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"issue_claim_token":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mark_booking_no_show":
{ Args: { "p_booking_id": string }; Returns: undefined
                           },
"participant_messages_last_day":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"patient_bookings":
{ Args: { "p_booking_id"?: string }; Returns: {
              "booking_id": string,"cancel_reason": string,"cancelled_by": Database["public"]['Enums']["booking_actor"],"clinic_address": string,"clinic_city": string,"clinic_id": string,"clinic_name": string,"created_at": string,"ends_at": string,"hold_expires_at": string,"lead_id": string,"reviewed": boolean,"service_id": string,"service_name": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"patient_lead_clinics":
{ Args: { "p_case_id"?: string }; Returns: {
              "city": string,"clinic_id": string,"lead_id": string,"logo_path": string,"logo_updated_at": string,"name": string,"removed": boolean
            }[]
                           },
"prototype_auto_verify_clinics":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"public_busy_intervals":
{ Args: { "p_clinic_ids": (string)[],"p_from": string,"p_to": string }; Returns: {
              "clinic_id": string,"ends_at": string,"starts_at": string
            }[]
                           },
"public_clinic_profile":
{ Args: { "p_clinic_id": string,"p_service_ids"?: (string)[] }; Returns: {
              "address": string,"all_prices": Json,"city": string,"dentists": Json,"description": string,"email": string,"has_emergency_hours": boolean,"id": string,"lat": number,"lng": number,"logo_path": string,"logo_updated_at": string,"name": string,"opening_hours": Json,"phone": string,"postal_code": string,"prices": Json,"status": Database["public"]['Enums']["clinic_status"],"trustpilot_entered_by": string,"trustpilot_review_count": number,"trustpilot_score": number,"trustpilot_updated_at": string,"trustpilot_url": string,"website": string
            }[]
                           },
"public_clinic_review_stats_many":
{ Args: { "p_clinic_ids": (string)[] }; Returns: {
              "as_quoted_count": number,"avg_stars": number,"clinic_id": string,"much_higher_count": number,"price_accuracy_pct": number,"review_count": number,"slightly_higher_count": number
            }[]
                           },
"public_clinics":
{ Args: { "p_clinic_ids"?: (string)[],"p_service_ids"?: (string)[] }; Returns: {
              "address": string,"city": string,"has_emergency_hours": boolean,"id": string,"lat": number,"lng": number,"logo_path": string,"logo_updated_at": string,"name": string,"opening_hours": Json,"phone": string,"postal_code": string,"prices": Json,"status": Database["public"]['Enums']["clinic_status"],"trustpilot_entered_by": string,"trustpilot_review_count": number,"trustpilot_score": number,"trustpilot_updated_at": string,"trustpilot_url": string,"website": string
            }[]
                           },
"public_reviews":
{ Args: { "p_clinic_id": string }; Returns: {
              "actual_price": number,"created_at": string,"lacked_transparency": boolean,"price_accuracy": Database["public"]['Enums']["price_accuracy"],"reply_created_at": string,"reply_text": string,"review_id": string,"stars": number,"text": string,"transparency_comment": string
            }[]
                           },
"release_expired_holds":
{ Args: { "p_clinic_id": string }; Returns: number
                           },
"replace_clinic_prices":
{ Args: { "p_prices": Json }; Returns: number
                           },
"replace_opening_hours":
{ Args: { "p_hours": Json }; Returns: number
                           },
"require_clinic_editor":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"reserve_chat_turn":
{ Args: { "p_content": string,"p_conversation_id": string,"p_user_id": string }; Returns: {
              "message_content": string,"message_created_at": string,"message_id": string,"user_message_count": number
            }[]
                           },
"reserve_image_turn":
{ Args: { "p_conversation_id": string,"p_user_id": string }; Returns: (string)[]
                           },
"review_is_approved":
{ Args: { "p_review_id": string }; Returns: boolean
                           },
"review_is_for_my_clinic":
{ Args: { "p_review_id": string }; Returns: boolean
                           },
"send_emergency_lead":
{ Args: { "p_clinic_id": string,"p_contact_name": string,"p_contact_phone": string,"p_description": string,"p_postal_code"?: string,"p_service_id": string,"p_starts_at": string }; Returns: {
              "case_id": string,"lead_id": string
            }[]
                           },
"send_leads":
{ Args: { "p_case_id": string,"p_clinic_ids": (string)[],"p_contact_name"?: string,"p_contact_phone"?: string,"p_requested_service_id"?: string,"p_requested_starts_at"?: string }; Returns: number
                           },
"send_message_with_images":
{ Args: { "p_body": string,"p_images": Json,"p_lead_id": string,"p_message_id": string,"p_user_id": string }; Returns: string
                           },
"service_duration_min":
{ Args: { "p_clinic_id": string,"p_service_id": string }; Returns: number
                           },
"set_clinic_location":
{ Args: { "p_lat": number,"p_lng": number }; Returns: undefined
                           },
"set_clinic_service_groups":
{ Args: { "p_group_ids": (string)[] }; Returns: (string)[]
                           },
"store_ai_summary":
{ Args: { "p_ai_assisted": boolean,"p_case_id": string,"p_model": string,"p_prompt_version": string,"p_summary": Json,"p_user_id": string }; Returns: undefined
                           },
"touch_last_active":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"try_consume_anonymous_ai_call":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"withdraw_consent":
{ Args: { "p_consent_id": string }; Returns: {
              "closed_conversations": number,"consent_type": Database["public"]['Enums']["consent_type"],"deleted_image_paths": (string)[],"withdrawn_at": string,"withdrawn_leads": number
            }[]
                           },
"withdraw_lead":
{ Args: { "p_lead_id": string }; Returns: undefined
                           },
"withdraw_open_leads":
{ Args: { "p_case_id"?: string,"p_patient_id": string }; Returns: number
                           }
          }
          Enums: {
            "ai_message_role": "user"|"assistant","booking_actor": "patient"|"clinic","booking_status": "held"|"booked"|"completed"|"no_show"|"cancelled","case_status": "draft"|"submitted"|"closed","case_timeframe": "asap"|"within_2_weeks"|"within_3_months"|"flexible","clinic_status": "imported"|"registered"|"verified"|"removed","consent_type": "health_data_sharing"|"image_upload"|"ai_processing","conversation_status": "active"|"closed","image_quality": "ok"|"too_dark"|"blurry"|"wrong_angle"|"not_teeth","image_view": "front"|"upper"|"lower"|"side_left"|"side_right"|"unclear","lead_decline_reason": "no_capacity"|"not_offered"|"needs_referral"|"other"|"clinic_left","lead_status": "sent"|"accepted"|"declined"|"booked"|"withdrawn","message_sender_role": "patient"|"clinic","moderation_status": "pending"|"approved"|"rejected","out_of_scope_topic": "price"|"clinic_recommendation","price_accuracy": "as_quoted"|"slightly_higher"|"much_higher","service_category": "cosmetic"|"general"|"emergency","user_role": "patient"|"clinic"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ai_message_role": ["user", "assistant"],"booking_actor": ["patient", "clinic"],"booking_status": ["held", "booked", "completed", "no_show", "cancelled"],"case_status": ["draft", "submitted", "closed"],"case_timeframe": ["asap", "within_2_weeks", "within_3_months", "flexible"],"clinic_status": ["imported", "registered", "verified", "removed"],"consent_type": ["health_data_sharing", "image_upload", "ai_processing"],"conversation_status": ["active", "closed"],"image_quality": ["ok", "too_dark", "blurry", "wrong_angle", "not_teeth"],"image_view": ["front", "upper", "lower", "side_left", "side_right", "unclear"],"lead_decline_reason": ["no_capacity", "not_offered", "needs_referral", "other", "clinic_left"],"lead_status": ["sent", "accepted", "declined", "booked", "withdrawn"],"message_sender_role": ["patient", "clinic"],"moderation_status": ["pending", "approved", "rejected"],"out_of_scope_topic": ["price", "clinic_recommendation"],"price_accuracy": ["as_quoted", "slightly_higher", "much_higher"],"service_category": ["cosmetic", "general", "emergency"],"user_role": ["patient", "clinic", "admin"]
          }
        }
} as const
