export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          attendees: string[] | null
          contact_id: string | null
          created_at: string
          date: string
          description: string | null
          duration: number
          id: string
          meeting_url: string | null
          metadata: Json | null
          status: string | null
          time: string
          title: string
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attendees?: string[] | null
          contact_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          duration?: number
          id?: string
          meeting_url?: string | null
          metadata?: Json | null
          status?: string | null
          time: string
          title: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attendees?: string[] | null
          contact_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration?: number
          id?: string
          meeting_url?: string | null
          metadata?: Json | null
          status?: string | null
          time?: string
          title?: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_knowledge: {
        Row: {
          categoria_intencao: string[]
          category: string | null
          content_md: string
          created_at: string
          id: string
          imagem_protocolo_path: string | null
          imagem_protocolo_url: string | null
          knowledge_type: string | null
          owner_user_id: string
          position: number
          priority: string | null
          protocolo_pdf_path: string | null
          protocolo_pdf_url: string | null
          related_products: string[]
          slug: string
          tags: string[]
          tipo_uso: string | null
          title: string
          updated_at: string
          when_to_escalate_md: string | null
          when_to_use_md: string | null
        }
        Insert: {
          categoria_intencao?: string[]
          category?: string | null
          content_md: string
          created_at?: string
          id?: string
          imagem_protocolo_path?: string | null
          imagem_protocolo_url?: string | null
          knowledge_type?: string | null
          owner_user_id?: string
          position?: number
          priority?: string | null
          protocolo_pdf_path?: string | null
          protocolo_pdf_url?: string | null
          related_products?: string[]
          slug: string
          tags?: string[]
          tipo_uso?: string | null
          title: string
          updated_at?: string
          when_to_escalate_md?: string | null
          when_to_use_md?: string | null
        }
        Update: {
          categoria_intencao?: string[]
          category?: string | null
          content_md?: string
          created_at?: string
          id?: string
          imagem_protocolo_path?: string | null
          imagem_protocolo_url?: string | null
          knowledge_type?: string | null
          owner_user_id?: string
          position?: number
          priority?: string | null
          protocolo_pdf_path?: string | null
          protocolo_pdf_url?: string | null
          related_products?: string[]
          slug?: string
          tags?: string[]
          tipo_uso?: string | null
          title?: string
          updated_at?: string
          when_to_escalate_md?: string | null
          when_to_use_md?: string | null
        }
        Relationships: []
      }
      brain_products: {
        Row: {
          aliases: string[]
          avoid_combinations: string | null
          categoria_intencao: string[]
          category: string[] | null
          combines_with: string[]
          common_objections_md: string | null
          created_at: string
          details_md: string | null
          id: string
          image_path: string | null
          image_url: string | null
          in_protocols: boolean | null
          indicacao_curta: string | null
          internal_notes_md: string | null
          is_active: boolean
          main_goals: string[]
          mercadolivre_url: string | null
          name: string
          owner_user_id: string
          position: number
          protocol_role: string | null
          protocolo_pdf_path: string | null
          protocolo_pdf_url: string | null
          quando_indicar_direto: string[]
          related_protocols: string[]
          site_url: string | null
          skin_types: string[]
          summary: string | null
          tipo_uso: string | null
          updated_at: string
          usage_short: string | null
          valor_sem_desconto: number | null
        }
        Insert: {
          aliases?: string[]
          avoid_combinations?: string | null
          categoria_intencao?: string[]
          category?: string[] | null
          combines_with?: string[]
          common_objections_md?: string | null
          created_at?: string
          details_md?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          in_protocols?: boolean | null
          indicacao_curta?: string | null
          internal_notes_md?: string | null
          is_active?: boolean
          main_goals?: string[]
          mercadolivre_url?: string | null
          name: string
          owner_user_id?: string
          position?: number
          protocol_role?: string | null
          protocolo_pdf_path?: string | null
          protocolo_pdf_url?: string | null
          quando_indicar_direto?: string[]
          related_protocols?: string[]
          site_url?: string | null
          skin_types?: string[]
          summary?: string | null
          tipo_uso?: string | null
          updated_at?: string
          usage_short?: string | null
          valor_sem_desconto?: number | null
        }
        Update: {
          aliases?: string[]
          avoid_combinations?: string | null
          categoria_intencao?: string[]
          category?: string[] | null
          combines_with?: string[]
          common_objections_md?: string | null
          created_at?: string
          details_md?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          in_protocols?: boolean | null
          indicacao_curta?: string | null
          internal_notes_md?: string | null
          is_active?: boolean
          main_goals?: string[]
          mercadolivre_url?: string | null
          name?: string
          owner_user_id?: string
          position?: number
          protocol_role?: string | null
          protocolo_pdf_path?: string | null
          protocolo_pdf_url?: string | null
          quando_indicar_direto?: string[]
          related_protocols?: string[]
          site_url?: string | null
          skin_types?: string[]
          summary?: string | null
          tipo_uso?: string | null
          updated_at?: string
          usage_short?: string | null
          valor_sem_desconto?: number | null
        }
        Relationships: []
      }
      brain_protocols: {
        Row: {
          created_at: string
          drive_url: string | null
          id: string
          image_path: string | null
          image_url: string | null
          knowledge_text: string | null
          name: string
          owner_user_id: string
          pdf_path: string | null
          pdf_url: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          drive_url?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          knowledge_text?: string | null
          name: string
          owner_user_id: string
          pdf_path?: string | null
          pdf_url?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          drive_url?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          knowledge_text?: string | null
          name?: string
          owner_user_id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_campaigns: {
        Row: {
          batch_size: number
          column_mapping: Json | null
          completed_at: string | null
          created_at: string
          custom_fields: string[] | null
          delay_between_batches: number
          delay_between_batches_max: number
          delay_max_ms: number
          delay_min_ms: number
          failed_count: number
          id: string
          media_rotation_mode: string
          media_url: string | null
          media_urls: string[]
          message_template: string
          message_type: string
          meta_template_id: string | null
          name: string
          next_batch_at: string | null
          rotation_strategy: string
          sent_count: number
          started_at: string | null
          status: string
          template_header_media: Json | null
          template_language: string | null
          template_name: string | null
          total_recipients: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          batch_size?: number
          column_mapping?: Json | null
          completed_at?: string | null
          created_at?: string
          custom_fields?: string[] | null
          delay_between_batches?: number
          delay_between_batches_max?: number
          delay_max_ms?: number
          delay_min_ms?: number
          failed_count?: number
          id?: string
          media_rotation_mode?: string
          media_url?: string | null
          media_urls?: string[]
          message_template: string
          message_type?: string
          meta_template_id?: string | null
          name: string
          next_batch_at?: string | null
          rotation_strategy?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          template_header_media?: Json | null
          template_language?: string | null
          template_name?: string | null
          total_recipients?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          batch_size?: number
          column_mapping?: Json | null
          completed_at?: string | null
          created_at?: string
          custom_fields?: string[] | null
          delay_between_batches?: number
          delay_between_batches_max?: number
          delay_max_ms?: number
          delay_min_ms?: number
          failed_count?: number
          id?: string
          media_rotation_mode?: string
          media_url?: string | null
          media_urls?: string[]
          message_template?: string
          message_type?: string
          meta_template_id?: string | null
          name?: string
          next_batch_at?: string | null
          rotation_strategy?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          template_header_media?: Json | null
          template_language?: string | null
          template_name?: string | null
          total_recipients?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_campaigns_meta_template_id_fkey"
            columns: ["meta_template_id"]
            isOneToOne: false
            referencedRelation: "meta_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          error_message: string | null
          id: string
          phone_number: string
          sent_at: string | null
          sent_media_url: string | null
          status: string
          variables: Json | null
          variation_indices: number[] | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          sent_media_url?: string | null
          status?: string
          variables?: Json | null
          variation_indices?: number[] | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number?: string
          sent_at?: string | null
          sent_media_url?: string | null
          status?: string
          variables?: Json | null
          variation_indices?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "broadcast_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          list_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          list_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          city: string | null
          client_memory: Json | null
          company: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          first_contact_date: string
          id: string
          is_blocked: boolean | null
          is_business: boolean | null
          last_activity: string
          name: string | null
          notes: string | null
          phone_number: string
          profile_picture_url: string | null
          score: number
          status_lead: string
          tags: string[] | null
          updated_at: string
          user_id: string | null
          whatsapp_id: string | null
          whatsapp_valid: boolean | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          city?: string | null
          client_memory?: Json | null
          company?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_contact_date?: string
          id?: string
          is_blocked?: boolean | null
          is_business?: boolean | null
          last_activity?: string
          name?: string | null
          notes?: string | null
          phone_number: string
          profile_picture_url?: string | null
          score?: number
          status_lead?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          whatsapp_id?: string | null
          whatsapp_valid?: boolean | null
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          city?: string | null
          client_memory?: Json | null
          company?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_contact_date?: string
          id?: string
          is_blocked?: boolean | null
          is_business?: boolean | null
          last_activity?: string
          name?: string | null
          notes?: string | null
          phone_number?: string
          profile_picture_url?: string | null
          score?: number
          status_lead?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          whatsapp_id?: string | null
          whatsapp_valid?: boolean | null
        }
        Relationships: []
      }
      conversation_access_grants: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          origin: string
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          team_member_id: string
          trigger_message_id: string | null
          trigger_snippet: string | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          origin?: string
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          team_member_id: string
          trigger_message_id?: string | null
          trigger_snippet?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          origin?: string
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          team_member_id?: string
          trigger_message_id?: string | null
          trigger_snippet?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_access_grants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_access_grants_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_access_grants_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_handoff_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          handoff_reason: string | null
          id: string
          metadata: Json
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          handoff_reason?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          handoff_reason?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_handoff_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_states: {
        Row: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused: boolean
          assigned_at: string | null
          assigned_team: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id: string | null
          attendance_finished: boolean
          attendance_finished_at: string | null
          attendance_finished_by: string | null
          contact_id: string
          created_at: string
          handoff_created_at: string | null
          handoff_reason: string | null
          handoff_type: string | null
          human_status: string | null
          human_takeover_required: boolean
          id: string
          is_active: boolean
          last_message_at: string
          metadata: Json | null
          nina_context: Json | null
          nina_reactivated_at: string | null
          nina_reactivated_by: string | null
          outside_dermoconsultant_hours: boolean
          requires_dermoconsultant: boolean
          started_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_paused?: boolean
          assigned_at?: string | null
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          attendance_finished?: boolean
          attendance_finished_at?: string | null
          attendance_finished_by?: string | null
          contact_id: string
          created_at?: string
          handoff_created_at?: string | null
          handoff_reason?: string | null
          handoff_type?: string | null
          human_status?: string | null
          human_takeover_required?: boolean
          id?: string
          is_active?: boolean
          last_message_at?: string
          metadata?: Json | null
          nina_context?: Json | null
          nina_reactivated_at?: string | null
          nina_reactivated_by?: string | null
          outside_dermoconsultant_hours?: boolean
          requires_dermoconsultant?: boolean
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_paused?: boolean
          assigned_at?: string | null
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          attendance_finished?: boolean
          attendance_finished_at?: string | null
          attendance_finished_by?: string | null
          contact_id?: string
          created_at?: string
          handoff_created_at?: string | null
          handoff_reason?: string | null
          handoff_type?: string | null
          human_status?: string | null
          human_takeover_required?: boolean
          id?: string
          is_active?: boolean
          last_message_at?: string
          metadata?: Json | null
          nina_context?: Json | null
          nina_reactivated_at?: string | null
          nina_reactivated_by?: string | null
          outside_dermoconsultant_hours?: boolean
          requires_dermoconsultant?: boolean
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_knowledge_skills: {
        Row: {
          content: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          owner_user_id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          is_completed: boolean | null
          scheduled_at: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          scheduled_at?: string | null
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          scheduled_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          company: string | null
          contact_id: string | null
          created_at: string | null
          due_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          priority: string | null
          stage: string | null
          stage_id: string
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
          value: number | null
          won_at: string | null
        }
        Insert: {
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          stage?: string | null
          stage_id: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          won_at?: string | null
        }
        Update: {
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          stage?: string | null
          stage_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      installed_packs: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          owner_user_id: string
          pack_slug: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          owner_user_id?: string
          pack_slug: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          owner_user_id?: string
          pack_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installed_packs_pack_slug_fkey"
            columns: ["pack_slug"]
            isOneToOne: false
            referencedRelation: "skill_packs"
            referencedColumns: ["slug"]
          },
        ]
      }
      installer_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          owner_user_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          owner_user_id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          owner_user_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      instances: {
        Row: {
          agent_type: string
          created_at: string
          hooks_token: string | null
          hostname: string | null
          id: string
          ingress_url: string | null
          last_heartbeat: string | null
          openclaw_dashboard_token: string | null
          openclaw_version: string | null
          owner_user_id: string
          status: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          agent_type?: string
          created_at?: string
          hooks_token?: string | null
          hostname?: string | null
          id?: string
          ingress_url?: string | null
          last_heartbeat?: string | null
          openclaw_dashboard_token?: string | null
          openclaw_version?: string | null
          owner_user_id?: string
          status?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          agent_type?: string
          created_at?: string
          hooks_token?: string | null
          hostname?: string | null
          id?: string
          ingress_url?: string | null
          last_heartbeat?: string | null
          openclaw_dashboard_token?: string | null
          openclaw_version?: string | null
          owner_user_id?: string
          status?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manual_tracking_logs: {
        Row: {
          attempts: number
          carrier: string
          created_at: string
          customer_name: string
          error_message: string | null
          id: string
          lock_id: string | null
          order_number: string
          phone_number: string
          requested_by: string | null
          requested_by_role: string | null
          result: string | null
          send_queue_id: string | null
          sent_at: string | null
          status: string
          template_name: string | null
          tracking_key: string | null
          tracking_number: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          carrier: string
          created_at?: string
          customer_name: string
          error_message?: string | null
          id?: string
          lock_id?: string | null
          order_number: string
          phone_number: string
          requested_by?: string | null
          requested_by_role?: string | null
          result?: string | null
          send_queue_id?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          tracking_key?: string | null
          tracking_number: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          carrier?: string
          created_at?: string
          customer_name?: string
          error_message?: string | null
          id?: string
          lock_id?: string | null
          order_number?: string
          phone_number?: string
          requested_by?: string | null
          requested_by_role?: string | null
          result?: string | null
          send_queue_id?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          tracking_key?: string | null
          tracking_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_tracking_logs_lock_id_fkey"
            columns: ["lock_id"]
            isOneToOne: false
            referencedRelation: "tracking_send_locks"
            referencedColumns: ["id"]
          },
        ]
      }
      message_grouping_queue: {
        Row: {
          contacts_data: Json | null
          created_at: string
          id: string
          message_data: Json
          message_id: string | null
          phone_number_id: string
          process_after: string | null
          processed: boolean
          whatsapp_message_id: string
        }
        Insert: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data: Json
          message_id?: string | null
          phone_number_id: string
          process_after?: string | null
          processed?: boolean
          whatsapp_message_id: string
        }
        Update: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data?: Json
          message_id?: string | null
          phone_number_id?: string
          process_after?: string | null
          processed?: boolean
          whatsapp_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_grouping_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_processing_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id: string
          priority?: number
          processed_at?: string | null
          raw_data: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id?: string
          priority?: number
          processed_at?: string | null
          raw_data?: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_ai_generated: boolean
          media_rotation_enabled: boolean
          media_rotation_mode: string
          media_urls: string[]
          message_type: string
          name: string
          tags: string[]
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          media_rotation_enabled?: boolean
          media_rotation_mode?: string
          media_urls?: string[]
          message_type?: string
          name: string
          tags?: string[]
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          media_rotation_enabled?: boolean
          media_rotation_mode?: string
          media_urls?: string[]
          message_type?: string
          name?: string
          tags?: string[]
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id: string
          media_type: string | null
          media_url: string | null
          metadata: Json | null
          nina_response_time: number | null
          processed_by_nina: boolean | null
          read_at: string | null
          reply_to_id: string | null
          sent_at: string
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          nina_response_time?: number | null
          processed_by_nina?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          from_type?: Database["public"]["Enums"]["message_from"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          nina_response_time?: number | null
          processed_by_nina?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_templates: {
        Row: {
          category: string
          components: Json
          created_at: string
          id: string
          labels: string[] | null
          language: string
          meta_template_id: string | null
          name: string
          samples: Json | null
          status: string
          updated_at: string
          validation_score: number | null
        }
        Insert: {
          category?: string
          components?: Json
          created_at?: string
          id?: string
          labels?: string[] | null
          language?: string
          meta_template_id?: string | null
          name: string
          samples?: Json | null
          status?: string
          updated_at?: string
          validation_score?: number | null
        }
        Update: {
          category?: string
          components?: Json
          created_at?: string
          id?: string
          labels?: string[] | null
          language?: string
          meta_template_id?: string | null
          name?: string
          samples?: Json | null
          status?: string
          updated_at?: string
          validation_score?: number | null
        }
        Relationships: []
      }
      nina_processing_queue: {
        Row: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          context_data?: Json | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          context_data?: Json | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nina_processing_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_processing_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_settings: {
        Row: {
          adaptive_response_enabled: boolean
          ai_model_mode: string | null
          ai_scheduling_enabled: boolean | null
          async_booking_enabled: boolean | null
          audio_response_enabled: boolean | null
          auto_response_enabled: boolean
          brain_identity: Json
          brain_provider: string
          brain_repo_url: string | null
          business_days: number[]
          business_hours_end: string
          business_hours_start: string
          company_name: string | null
          coupon_code: string | null
          coupon_discount_percent: number | null
          coupon_enabled: boolean
          created_at: string
          elevenlabs_api_key: string | null
          elevenlabs_model: string | null
          elevenlabs_similarity_boost: number
          elevenlabs_speaker_boost: boolean
          elevenlabs_speed: number | null
          elevenlabs_stability: number
          elevenlabs_style: number
          elevenlabs_voice_id: string
          id: string
          is_active: boolean
          message_breaking_enabled: boolean
          openclaw_gateway_token: string | null
          openclaw_gateway_url: string | null
          openclaw_model: string | null
          response_delay_max: number
          response_delay_min: number
          route_all_to_receiver_enabled: boolean
          sdr_name: string | null
          system_prompt_override: string | null
          test_phone_numbers: Json | null
          test_system_prompt: string | null
          timezone: string
          updated_at: string
          user_id: string | null
          whatsapp_access_token: string | null
          whatsapp_business_account_id: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_verify_token: string | null
        }
        Insert: {
          adaptive_response_enabled?: boolean
          ai_model_mode?: string | null
          ai_scheduling_enabled?: boolean | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_response_enabled?: boolean
          brain_identity?: Json
          brain_provider?: string
          brain_repo_url?: string | null
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          company_name?: string | null
          coupon_code?: string | null
          coupon_discount_percent?: number | null
          coupon_enabled?: boolean
          created_at?: string
          elevenlabs_api_key?: string | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          openclaw_gateway_token?: string | null
          openclaw_gateway_url?: string | null
          openclaw_model?: string | null
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_verify_token?: string | null
        }
        Update: {
          adaptive_response_enabled?: boolean
          ai_model_mode?: string | null
          ai_scheduling_enabled?: boolean | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_response_enabled?: boolean
          brain_identity?: Json
          brain_provider?: string
          brain_repo_url?: string | null
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          company_name?: string | null
          coupon_code?: string | null
          coupon_discount_percent?: number | null
          coupon_enabled?: boolean
          created_at?: string
          elevenlabs_api_key?: string | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          openclaw_gateway_token?: string | null
          openclaw_gateway_url?: string | null
          openclaw_model?: string | null
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_verify_token?: string | null
        }
        Relationships: []
      }
      nina_test_results: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string
          id: string
          owner_user_id: string
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          owner_user_id?: string
          run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          owner_user_id?: string
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          ai_trigger_criteria: string | null
          color: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_ai_managed: boolean | null
          is_system: boolean | null
          position: number
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_ai_managed?: boolean | null
          is_system?: boolean | null
          position?: number
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_ai_managed?: boolean | null
          is_system?: boolean | null
          position?: number
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reaper_lock: {
        Row: {
          id: boolean
          locked_at: string | null
        }
        Insert: {
          id?: boolean
          locked_at?: string | null
        }
        Update: {
          id?: boolean
          locked_at?: string | null
        }
        Relationships: []
      }
      send_queue: {
        Row: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_events: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          normalized: Json
          order_number: string | null
          phone_number: string | null
          raw_payload: Json
          send_status: string
          shopify_event_id: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          normalized?: Json
          order_number?: string | null
          phone_number?: string | null
          raw_payload?: Json
          send_status?: string
          shopify_event_id?: string | null
          topic?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          normalized?: Json
          order_number?: string | null
          phone_number?: string | null
          raw_payload?: Json
          send_status?: string
          shopify_event_id?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_shipment_notifications: {
        Row: {
          created_at: string
          event_id: string | null
          fulfillment_id: string
          id: string
          order_number: string | null
          phone_number: string | null
          status: string
          tracking_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          fulfillment_id: string
          id?: string
          order_number?: string | null
          phone_number?: string | null
          status?: string
          tracking_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          fulfillment_id?: string
          id?: string
          order_number?: string | null
          phone_number?: string | null
          status?: string
          tracking_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      skill_packs: {
        Row: {
          active_by_default: boolean
          config_schema: Json
          created_at: string
          description: string | null
          level: string
          name: string
          position: number
          requires_edge_fns: string[]
          requires_secrets: string[]
          slug: string
          updated_at: string
        }
        Insert: {
          active_by_default?: boolean
          config_schema?: Json
          created_at?: string
          description?: string | null
          level: string
          name: string
          position?: number
          requires_edge_fns?: string[]
          requires_secrets?: string[]
          slug: string
          updated_at?: string
        }
        Update: {
          active_by_default?: boolean
          config_schema?: Json
          created_at?: string
          description?: string | null
          level?: string
          name?: string
          position?: number
          requires_edge_fns?: string[]
          requires_secrets?: string[]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      stale_leads_lock: {
        Row: {
          id: boolean
          locked_at: string | null
        }
        Insert: {
          id?: boolean
          locked_at?: string | null
        }
        Update: {
          id?: boolean
          locked_at?: string | null
        }
        Relationships: []
      }
      tag_definitions: {
        Row: {
          category: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_functions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          function_id: string | null
          id: string
          last_active: string | null
          name: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          team_id: string | null
          updated_at: string
          user_id: string | null
          weight: number | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email: string
          function_id?: string | null
          id?: string
          last_active?: string | null
          name: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight?: number | null
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          function_id?: string | null
          id?: string
          last_active?: string | null
          name?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "team_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tracking_send_locks: {
        Row: {
          attempts: number
          carrier: string | null
          created_at: string
          customer_name: string | null
          error_message: string | null
          fulfillment_id: string | null
          id: string
          order_number: string | null
          phone_number: string | null
          previous_tracking_key: string | null
          send_queue_id: string | null
          sent_at: string | null
          sent_by: string | null
          source: string
          status: string
          template_name: string | null
          tracking_key: string
          tracking_number: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          carrier?: string | null
          created_at?: string
          customer_name?: string | null
          error_message?: string | null
          fulfillment_id?: string | null
          id?: string
          order_number?: string | null
          phone_number?: string | null
          previous_tracking_key?: string | null
          send_queue_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source?: string
          status?: string
          template_name?: string | null
          tracking_key: string
          tracking_number: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          carrier?: string | null
          created_at?: string
          customer_name?: string | null
          error_message?: string | null
          fulfillment_id?: string | null
          id?: string
          order_number?: string | null
          phone_number?: string | null
          previous_tracking_key?: string | null
          send_queue_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source?: string
          status?: string
          template_name?: string | null
          tracking_key?: string
          tracking_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      contacts_with_stats: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          client_memory: Json | null
          created_at: string | null
          email: string | null
          first_contact_date: string | null
          human_messages: number | null
          id: string | null
          is_blocked: boolean | null
          is_business: boolean | null
          last_activity: string | null
          name: string | null
          nina_messages: number | null
          notes: string | null
          phone_number: string | null
          profile_picture_url: string | null
          tags: string[] | null
          total_messages: number | null
          updated_at: string | null
          user_id: string | null
          user_messages: number | null
          whatsapp_id: string | null
        }
        Relationships: []
      }
      nina_settings_public: {
        Row: {
          auto_response_enabled: boolean | null
          business_days: number[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          company_name: string | null
          id: string | null
          is_active: boolean | null
          sdr_name: string | null
          timezone: string | null
        }
        Insert: {
          auto_response_enabled?: boolean | null
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          company_name?: string | null
          id?: string | null
          is_active?: boolean | null
          sdr_name?: string | null
          timezone?: string | null
        }
        Update: {
          auto_response_enabled?: boolean | null
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          company_name?: string | null
          id?: string | null
          is_active?: boolean | null
          sdr_name?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_shopify_tracking_locks: {
        Args: {
          p_carrier?: string
          p_customer_name?: string
          p_event_id?: string
          p_fulfillment_id: string
          p_order_number?: string
          p_phone_number?: string
          p_template_name?: string
          p_tracking_key: string
          p_tracking_number: string
        }
        Returns: Json
      }
      acquire_tracking_send_lock: {
        Args: {
          p_carrier?: string
          p_customer_name?: string
          p_fulfillment_id?: string
          p_order_number?: string
          p_phone_number?: string
          p_sent_by?: string
          p_source: string
          p_template_name?: string
          p_tracking_key: string
          p_tracking_number: string
        }
        Returns: Json
      }
      apply_expedicao_handoff: {
        Args: {
          _conversation_id: string
          _origin?: string
          _reason: string
          _run_id?: string
          _trigger_message_id?: string
          _trigger_snippet?: string
        }
        Returns: Json
      }
      assign_conversation_to_expedicao: {
        Args: {
          _conversation_id: string
          _reason: string
          _team_member_id: string
        }
        Returns: Json
      }
      claim_message_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_nina_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "nina_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_send_queue_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "send_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_processed_message_queue: { Args: never; Returns: undefined }
      cleanup_processed_queues: { Args: never; Returns: undefined }
      current_team_member_id: { Args: never; Returns: string }
      dermo_can_access_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      dermo_finish_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      dermo_reply: {
        Args: { _content: string; _conversation_id: string }
        Returns: string
      }
      expedicao_can_access_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      expedicao_finish_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      expedicao_reply: {
        Args: { _content: string; _conversation_id: string }
        Returns: string
      }
      get_auth_user_id: { Args: never; Returns: string }
      get_my_dermo_messages: {
        Args: { _conversation_id: string }
        Returns: {
          content: string
          conversation_id: string
          from_type: Database["public"]["Enums"]["message_from"]
          id: string
          media_type: string
          media_url: string
          sent_at: string
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
        }[]
      }
      get_my_expedicao_messages: {
        Args: { _conversation_id: string }
        Returns: {
          content: string
          conversation_id: string
          from_type: Database["public"]["Enums"]["message_from"]
          id: string
          media_type: string
          media_url: string
          sent_at: string
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
        }[]
      }
      get_or_create_conversation_state: {
        Args: { p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_secret: { Args: { secret_name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      internal_grant_dermo_access: {
        Args: {
          _conversation_id: string
          _origin?: string
          _reason: string
          _team_member_id: string
          _trigger_message_id?: string
          _trigger_snippet?: string
        }
        Returns: Json
      }
      internal_grant_expedicao_access: {
        Args: {
          _conversation_id: string
          _origin?: string
          _reason: string
          _team_member_id: string
          _trigger_message_id?: string
          _trigger_snippet?: string
        }
        Returns: Json
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      is_dermo_handoff_reason: { Args: { _reason: string }; Returns: boolean }
      is_expedicao_handoff_reason: {
        Args: { _reason: string }
        Returns: boolean
      }
      is_operational_staff: { Args: { _user_id: string }; Returns: boolean }
      is_sensitive_dermo_reason: { Args: { _reason: string }; Returns: boolean }
      list_my_dermo_conversations: {
        Args: never
        Returns: {
          attendance_finished: boolean
          contact_name: string
          contact_phone_masked: string
          conversation_id: string
          granted_at: string
          handoff_at: string
          human_status: string
          last_message_at: string
          reason: string
          trigger_message_id: string
          trigger_snippet: string
        }[]
      }
      list_my_expedicao_conversations: {
        Args: never
        Returns: {
          attendance_finished: boolean
          contact_name: string
          contact_phone_masked: string
          conversation_id: string
          granted_at: string
          handoff_at: string
          human_status: string
          last_message_at: string
          reason: string
          trigger_message_id: string
          trigger_snippet: string
        }[]
      }
      normalize_tracking_code: { Args: { p_code: string }; Returns: string }
      pick_dermo_assignee: { Args: { _reason: string }; Returns: Json }
      pick_next_dermoconsultora: { Args: never; Returns: string }
      release_shopify_tracking_locks: {
        Args: {
          p_error_message?: string
          p_fulfillment_id: string
          p_result: string
          p_send_queue_id?: string
          p_tracking_key: string
          p_tracking_number: string
        }
        Returns: Json
      }
      release_tracking_send_lock: {
        Args: {
          p_error_message?: string
          p_result: string
          p_send_queue_id?: string
          p_tracking_key: string
        }
        Returns: Json
      }
      revoke_expedicao_access: {
        Args: { _conversation_id: string; _reason?: string }
        Returns: boolean
      }
      set_secret: {
        Args: { secret_name: string; secret_value: string }
        Returns: undefined
      }
      trigger_reaper: { Args: never; Returns: undefined }
      trigger_stale_leads: { Args: never; Returns: undefined }
      update_client_memory: {
        Args: { p_contact_id: string; p_new_memory: Json }
        Returns: undefined
      }
      update_conversation_state: {
        Args: {
          p_action?: string
          p_context?: Json
          p_conversation_id: string
          p_new_state: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user" | "sdr" | "manager" | "expedicao" | "dermo"
      appointment_type: "demo" | "meeting" | "support" | "followup"
      conversation_status: "nina" | "human" | "paused"
      member_role: "admin" | "manager" | "agent"
      member_status: "active" | "invited" | "disabled"
      message_from: "user" | "nina" | "human"
      message_status: "sent" | "delivered" | "read" | "failed" | "processing"
      message_type: "text" | "audio" | "image" | "document" | "video"
      queue_status: "pending" | "processing" | "completed" | "failed"
      team_assignment: "mateus" | "igor" | "fe" | "vendas" | "suporte"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "sdr", "manager", "expedicao", "dermo"],
      appointment_type: ["demo", "meeting", "support", "followup"],
      conversation_status: ["nina", "human", "paused"],
      member_role: ["admin", "manager", "agent"],
      member_status: ["active", "invited", "disabled"],
      message_from: ["user", "nina", "human"],
      message_status: ["sent", "delivered", "read", "failed", "processing"],
      message_type: ["text", "audio", "image", "document", "video"],
      queue_status: ["pending", "processing", "completed", "failed"],
      team_assignment: ["mateus", "igor", "fe", "vendas", "suporte"],
    },
  },
} as const
