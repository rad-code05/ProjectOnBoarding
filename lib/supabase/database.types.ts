export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ai_chats: {
        Row: {
          created_at: string;
          id: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_chats_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      ai_memory: {
        Row: {
          call_me: string | null;
          favourite_reports: string[];
          frequent_questions: string[];
          request_types: Database["public"]["Enums"]["request_type"][];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          call_me?: string | null;
          favourite_reports?: string[];
          frequent_questions?: string[];
          request_types?: Database["public"]["Enums"]["request_type"][];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          call_me?: string | null;
          favourite_reports?: string[];
          frequent_questions?: string[];
          request_types?: Database["public"]["Enums"]["request_type"][];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_memory_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      ai_messages: {
        Row: {
          chat_id: string;
          created_at: string;
          id: string;
          model: number | null;
          parts: NonNullable<Json>;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          chat_id: string;
          created_at?: string;
          id?: string;
          model?: number | null;
          parts: NonNullable<Json>;
          role: string;
        };
        Update: {
          chat_id?: string;
          created_at?: string;
          id?: string;
          model?: number | null;
          parts?: NonNullable<Json>;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "ai_chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_messages_model_fkey";
            columns: ["model"];
            isOneToOne: false;
            referencedRelation: "ai_models";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_models: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          model_id: string;
          name: string;
          note: string | null;
          price_in: number;
          price_out: number;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          model_id: string;
          name: string;
          note?: string | null;
          price_in: number;
          price_out: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          model_id?: string;
          name?: string;
          note?: string | null;
          price_in?: number;
          price_out?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_settings: {
        Row: {
          enabled: boolean;
          hourly_limit: number;
          id: boolean;
          model: number;
          monthly_budget_usd: number;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          enabled?: boolean;
          hourly_limit?: number;
          id?: boolean;
          model: number;
          monthly_budget_usd?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          hourly_limit?: number;
          id?: boolean;
          model?: number;
          monthly_budget_usd?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_settings_model_fkey";
            columns: ["model"];
            isOneToOne: false;
            referencedRelation: "ai_models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          cost_usd: number;
          created_at: string;
          id: number;
          input_tokens: number;
          model: number;
          output_tokens: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          cost_usd: number;
          created_at?: string;
          id?: never;
          input_tokens: number;
          model: number;
          output_tokens: number;
          user_id: string;
        };
        Update: {
          cost_usd?: number;
          created_at?: string;
          id?: never;
          input_tokens?: number;
          model?: number;
          output_tokens?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_model_fkey";
            columns: ["model"];
            isOneToOne: false;
            referencedRelation: "ai_models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      app_settings: {
        Row: {
          company_timezone: string;
          id: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          company_timezone?: string;
          id?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          company_timezone?: string;
          id?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      app_users: {
        Row: {
          active: boolean;
          clerk_user_id: string;
          created_at: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          timezone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          clerk_user_id: string;
          created_at?: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          clerk_user_id?: string;
          created_at?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      approvals: {
        Row: {
          comment: string | null;
          decided_at: string;
          decided_by: string;
          decision: string;
          flagged_sections: number[];
          id: string;
          request_id: string;
          signature_id: string | null;
          snapshot_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          comment?: string | null;
          decided_at?: string;
          decided_by: string;
          decision: string;
          flagged_sections?: number[];
          id?: string;
          request_id: string;
          signature_id?: string | null;
          snapshot_id?: string | null;
        };
        Update: {
          comment?: string | null;
          decided_at?: string;
          decided_by?: string;
          decision?: string;
          flagged_sections?: number[];
          id?: string;
          request_id?: string;
          signature_id?: string | null;
          snapshot_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "approvals_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_signature_id_fkey";
            columns: ["signature_id"];
            isOneToOne: false;
            referencedRelation: "signatures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "request_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          diff: NonNullable<Json>;
          entity: string;
          entity_id: string | null;
          id: number;
          source: Database["public"]["Enums"]["audit_source"];
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity: string;
          entity_id?: string | null;
          id?: never;
          source: Database["public"]["Enums"]["audit_source"];
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity?: string;
          entity_id?: string | null;
          id?: never;
          source?: Database["public"]["Enums"]["audit_source"];
        };
        Relationships: [];
      };
      catalog_apps: {
        Row: {
          actions: string[];
          active: boolean;
          category_id: number;
          id: number;
          multi_permission: boolean;
          name: string;
          permissions: string[];
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          actions: string[];
          active?: boolean;
          category_id: number;
          id?: never;
          multi_permission?: boolean;
          name: string;
          permissions: string[];
          sort_order?: number;
        };
        Update: {
          actions?: string[];
          active?: boolean;
          category_id?: number;
          id?: never;
          multi_permission?: boolean;
          name?: string;
          permissions?: string[];
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_apps_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "catalog_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_categories: {
        Row: {
          active: boolean;
          id: number;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          id?: never;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          id?: never;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      country_regions: {
        Row: {
          code: string;
          country: string;
          id: number;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          country: string;
          id?: never;
          name: string;
        };
        Update: {
          code?: string;
          country?: string;
          id?: never;
          name?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          active: boolean;
          id: number;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          id?: never;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          id?: never;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      employee_access_inventory: {
        Row: {
          access_type_id: number | null;
          app_id: number | null;
          asset_tag: string | null;
          category_name: string | null;
          created_at: string;
          description: string | null;
          employee_id: string;
          end_reason: string | null;
          ended_at: string | null;
          ended_request_id: string | null;
          equipment_type_id: number | null;
          granted_at: string;
          granted_request_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["inventory_kind"];
          name: string;
          permission: string | null;
          source: string;
        };
        ComputedFields: never;
        Insert: {
          access_type_id?: number | null;
          app_id?: number | null;
          asset_tag?: string | null;
          category_name?: string | null;
          created_at?: string;
          description?: string | null;
          employee_id: string;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_request_id?: string | null;
          equipment_type_id?: number | null;
          granted_at: string;
          granted_request_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["inventory_kind"];
          name: string;
          permission?: string | null;
          source?: string;
        };
        Update: {
          access_type_id?: number | null;
          app_id?: number | null;
          asset_tag?: string | null;
          category_name?: string | null;
          created_at?: string;
          description?: string | null;
          employee_id?: string;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_request_id?: string | null;
          equipment_type_id?: number | null;
          granted_at?: string;
          granted_request_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["inventory_kind"];
          name?: string;
          permission?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_access_inventory_access_type_id_fkey";
            columns: ["access_type_id"];
            isOneToOne: false;
            referencedRelation: "physical_access_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_access_inventory_app_id_fkey";
            columns: ["app_id"];
            isOneToOne: false;
            referencedRelation: "catalog_apps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_access_inventory_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_access_inventory_ended_request_id_fkey";
            columns: ["ended_request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_access_inventory_equipment_type_id_fkey";
            columns: ["equipment_type_id"];
            isOneToOne: false;
            referencedRelation: "equipment_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_access_inventory_granted_request_id_fkey";
            columns: ["granted_request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          created_at: string;
          first_name: string | null;
          id: string;
          last_name: string | null;
          updated_at: string;
          work_email: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          updated_at?: string;
          work_email: string;
        };
        Update: {
          created_at?: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          updated_at?: string;
          work_email?: string;
        };
        Relationships: [];
      };
      equipment_types: {
        Row: {
          actions: string[];
          active: boolean;
          id: number;
          name: string;
          needs_description: boolean;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          actions?: string[];
          active?: boolean;
          id?: never;
          name: string;
          needs_description?: boolean;
          sort_order?: number;
        };
        Update: {
          actions?: string[];
          active?: boolean;
          id?: never;
          name?: string;
          needs_description?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      execution_checklist_items: {
        Row: {
          active: boolean;
          applies_to: Database["public"]["Enums"]["request_type"][];
          id: number;
          key: string;
          label: string;
          sort_order: number;
          type_labels: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          applies_to: Database["public"]["Enums"]["request_type"][];
          id?: never;
          key: string;
          label: string;
          sort_order?: number;
          type_labels?: NonNullable<Json>;
        };
        Update: {
          active?: boolean;
          applies_to?: Database["public"]["Enums"]["request_type"][];
          id?: never;
          key?: string;
          label?: string;
          sort_order?: number;
          type_labels?: NonNullable<Json>;
        };
        Relationships: [];
      };
      execution_confirmations: {
        Row: {
          checks: NonNullable<Json>;
          created_at: string;
          executed_by: string;
          notes: string | null;
          request_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          checks?: NonNullable<Json>;
          created_at?: string;
          executed_by: string;
          notes?: string | null;
          request_id: string;
          updated_at?: string;
        };
        Update: {
          checks?: NonNullable<Json>;
          created_at?: string;
          executed_by?: string;
          notes?: string | null;
          request_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "execution_confirmations_executed_by_fkey";
            columns: ["executed_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "execution_confirmations_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
        ];
      };
      form_fields: {
        Row: {
          applies_to: Database["public"]["Enums"]["request_type"][];
          field_type: string;
          form_version_id: number;
          help_text: string | null;
          id: number;
          key: string;
          label: string;
          options: Json | null;
          required: boolean;
          section: number;
          sort_order: number;
          storage: string;
        };
        ComputedFields: never;
        Insert: {
          applies_to?: Database["public"]["Enums"]["request_type"][];
          field_type: string;
          form_version_id: number;
          help_text?: string | null;
          id?: never;
          key: string;
          label: string;
          options?: Json | null;
          required?: boolean;
          section: number;
          sort_order: number;
          storage?: string;
        };
        Update: {
          applies_to?: Database["public"]["Enums"]["request_type"][];
          field_type?: string;
          form_version_id?: number;
          help_text?: string | null;
          id?: never;
          key?: string;
          label?: string;
          options?: Json | null;
          required?: boolean;
          section?: number;
          sort_order?: number;
          storage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "form_fields_form_version_id_fkey";
            columns: ["form_version_id"];
            isOneToOne: false;
            referencedRelation: "form_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      form_versions: {
        Row: {
          id: number;
          is_current: boolean;
          published_at: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          is_current?: boolean;
          published_at?: string;
          version: string;
        };
        Update: {
          id?: never;
          is_current?: boolean;
          published_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      office_cities: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          name: string;
          office_id: number;
          region_id: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name: string;
          office_id: number;
          region_id: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name?: string;
          office_id?: number;
          region_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "office_cities_office_id_fkey";
            columns: ["office_id"];
            isOneToOne: false;
            referencedRelation: "offices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "office_cities_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "country_regions";
            referencedColumns: ["id"];
          },
        ];
      };
      offices: {
        Row: {
          active: boolean;
          city: string | null;
          country: string;
          created_at: string;
          id: number;
          name: string;
          sort_order: number;
          uses_regions: boolean;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          city?: string | null;
          country: string;
          created_at?: string;
          id?: never;
          name: string;
          sort_order?: number;
          uses_regions?: boolean;
        };
        Update: {
          active?: boolean;
          city?: string | null;
          country?: string;
          created_at?: string;
          id?: never;
          name?: string;
          sort_order?: number;
          uses_regions?: boolean;
        };
        Relationships: [];
      };
      pdf_documents: {
        Row: {
          byte_size: number;
          file_name: string;
          generated_at: string;
          generated_by: string;
          id: string;
          request_id: string;
          sha256: string;
          snapshot_id: string;
          storage_path: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          byte_size: number;
          file_name: string;
          generated_at?: string;
          generated_by: string;
          id?: string;
          request_id: string;
          sha256: string;
          snapshot_id: string;
          storage_path: string;
          timezone: string;
        };
        Update: {
          byte_size?: number;
          file_name?: string;
          generated_at?: string;
          generated_by?: string;
          id?: string;
          request_id?: string;
          sha256?: string;
          snapshot_id?: string;
          storage_path?: string;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pdf_documents_generated_by_fkey";
            columns: ["generated_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "pdf_documents_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pdf_documents_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "request_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      physical_access_types: {
        Row: {
          actions: string[];
          active: boolean;
          id: number;
          name: string;
          scopes: string[];
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          actions: string[];
          active?: boolean;
          id?: never;
          name: string;
          scopes: string[];
          sort_order?: number;
        };
        Update: {
          actions?: string[];
          active?: boolean;
          id?: never;
          name?: string;
          scopes?: string[];
          sort_order?: number;
        };
        Relationships: [];
      };
      request_access_items: {
        Row: {
          action: string;
          app_id: number | null;
          app_name: string;
          category_name: string;
          created_at: string;
          done_at: string | null;
          done_by: string | null;
          id: string;
          inventory_id: string | null;
          notes: string | null;
          permission: string | null;
          removal_method: string | null;
          request_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          app_id?: number | null;
          app_name: string;
          category_name: string;
          created_at?: string;
          done_at?: string | null;
          done_by?: string | null;
          id?: string;
          inventory_id?: string | null;
          notes?: string | null;
          permission?: string | null;
          removal_method?: string | null;
          request_id: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          app_id?: number | null;
          app_name?: string;
          category_name?: string;
          created_at?: string;
          done_at?: string | null;
          done_by?: string | null;
          id?: string;
          inventory_id?: string | null;
          notes?: string | null;
          permission?: string | null;
          removal_method?: string | null;
          request_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_access_items_app_id_fkey";
            columns: ["app_id"];
            isOneToOne: false;
            referencedRelation: "catalog_apps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_access_items_done_by_fkey";
            columns: ["done_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "request_access_items_inventory_id_fkey";
            columns: ["inventory_id"];
            isOneToOne: false;
            referencedRelation: "employee_access_inventory";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_access_items_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
        ];
      };
      request_equipment_items: {
        Row: {
          action: string;
          asset_tag: string | null;
          created_at: string;
          description: string | null;
          id: string;
          inventory_id: string | null;
          notes: string | null;
          request_id: string;
          return_reason: string | null;
          return_recorded_at: string | null;
          return_recorded_by: string | null;
          return_status: string | null;
          type_id: number;
          type_name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          asset_tag?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          inventory_id?: string | null;
          notes?: string | null;
          request_id: string;
          return_reason?: string | null;
          return_recorded_at?: string | null;
          return_recorded_by?: string | null;
          return_status?: string | null;
          type_id: number;
          type_name: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          asset_tag?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          inventory_id?: string | null;
          notes?: string | null;
          request_id?: string;
          return_reason?: string | null;
          return_recorded_at?: string | null;
          return_recorded_by?: string | null;
          return_status?: string | null;
          type_id?: number;
          type_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_equipment_items_inventory_id_fkey";
            columns: ["inventory_id"];
            isOneToOne: false;
            referencedRelation: "employee_access_inventory";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_equipment_items_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_equipment_items_return_recorded_by_fkey";
            columns: ["return_recorded_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "request_equipment_items_type_id_fkey";
            columns: ["type_id"];
            isOneToOne: false;
            referencedRelation: "equipment_types";
            referencedColumns: ["id"];
          },
        ];
      };
      request_physical_access_items: {
        Row: {
          action: string;
          created_at: string;
          done_at: string | null;
          done_by: string | null;
          id: string;
          inventory_id: string | null;
          notes: string | null;
          request_id: string;
          scope: string | null;
          type_id: number;
          type_name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          done_at?: string | null;
          done_by?: string | null;
          id?: string;
          inventory_id?: string | null;
          notes?: string | null;
          request_id: string;
          scope?: string | null;
          type_id: number;
          type_name: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          done_at?: string | null;
          done_by?: string | null;
          id?: string;
          inventory_id?: string | null;
          notes?: string | null;
          request_id?: string;
          scope?: string | null;
          type_id?: number;
          type_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_physical_access_items_done_by_fkey";
            columns: ["done_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "request_physical_access_items_inventory_id_fkey";
            columns: ["inventory_id"];
            isOneToOne: false;
            referencedRelation: "employee_access_inventory";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_physical_access_items_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_physical_access_items_type_id_fkey";
            columns: ["type_id"];
            isOneToOne: false;
            referencedRelation: "physical_access_types";
            referencedColumns: ["id"];
          },
        ];
      };
      request_snapshots: {
        Row: {
          created_at: string;
          created_by: string;
          data: NonNullable<Json>;
          id: string;
          kind: string;
          request_id: string;
          sha256: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          data: NonNullable<Json>;
          id?: string;
          kind: string;
          request_id: string;
          sha256: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          data?: NonNullable<Json>;
          id?: string;
          kind?: string;
          request_id?: string;
          sha256?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_snapshots_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "request_snapshots_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
        ];
      };
      requests: {
        Row: {
          access_cutoff_at: string | null;
          assignee_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          closed_at: string | null;
          country: string | null;
          created_at: string;
          created_by: string;
          custom_fields: NonNullable<Json>;
          department_id: number | null;
          effective_date: string | null;
          employee_id: string | null;
          execution_started_at: string | null;
          first_name: string | null;
          form_version_id: number;
          handover_to: string | null;
          id: string;
          job_title: string | null;
          last_name: string | null;
          last_working_day: string | null;
          mailbox_handling: string | null;
          mailbox_recorded_at: string | null;
          mailbox_recorded_by: string | null;
          manager_name: string | null;
          nationalities: string[] | null;
          office_city_id: number | null;
          office_id: number | null;
          priority: Database["public"]["Enums"]["request_priority"];
          region_id: number | null;
          requestor_name: string | null;
          return_reason: string | null;
          sla_due_at: string | null;
          sla_missed_reason: string | null;
          sla_timeline: Database["public"]["Enums"]["sla_timeline"] | null;
          state: Database["public"]["Enums"]["request_state"];
          state_changed_at: string | null;
          ticket_id: string;
          ticket_number: number;
          ticket_year: number;
          type: Database["public"]["Enums"]["request_type"];
          updated_at: string;
          version: number;
          work_email: string | null;
        };
        ComputedFields: never;
        Insert: {
          access_cutoff_at?: string | null;
          assignee_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          closed_at?: string | null;
          country?: string | null;
          created_at?: string;
          created_by: string;
          custom_fields?: NonNullable<Json>;
          department_id?: number | null;
          effective_date?: string | null;
          employee_id?: string | null;
          execution_started_at?: string | null;
          first_name?: string | null;
          form_version_id: number;
          handover_to?: string | null;
          id?: string;
          job_title?: string | null;
          last_name?: string | null;
          last_working_day?: string | null;
          mailbox_handling?: string | null;
          mailbox_recorded_at?: string | null;
          mailbox_recorded_by?: string | null;
          manager_name?: string | null;
          nationalities?: string[] | null;
          office_city_id?: number | null;
          office_id?: number | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          region_id?: number | null;
          requestor_name?: string | null;
          return_reason?: string | null;
          sla_due_at?: string | null;
          sla_missed_reason?: string | null;
          sla_timeline?: Database["public"]["Enums"]["sla_timeline"] | null;
          state?: Database["public"]["Enums"]["request_state"];
          state_changed_at?: string | null;
          ticket_id: string;
          ticket_number: number;
          ticket_year: number;
          type?: Database["public"]["Enums"]["request_type"];
          updated_at?: string;
          version?: number;
          work_email?: string | null;
        };
        Update: {
          access_cutoff_at?: string | null;
          assignee_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          closed_at?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string;
          custom_fields?: NonNullable<Json>;
          department_id?: number | null;
          effective_date?: string | null;
          employee_id?: string | null;
          execution_started_at?: string | null;
          first_name?: string | null;
          form_version_id?: number;
          handover_to?: string | null;
          id?: string;
          job_title?: string | null;
          last_name?: string | null;
          last_working_day?: string | null;
          mailbox_handling?: string | null;
          mailbox_recorded_at?: string | null;
          mailbox_recorded_by?: string | null;
          manager_name?: string | null;
          nationalities?: string[] | null;
          office_city_id?: number | null;
          office_id?: number | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          region_id?: number | null;
          requestor_name?: string | null;
          return_reason?: string | null;
          sla_due_at?: string | null;
          sla_missed_reason?: string | null;
          sla_timeline?: Database["public"]["Enums"]["sla_timeline"] | null;
          state?: Database["public"]["Enums"]["request_state"];
          state_changed_at?: string | null;
          ticket_id?: string;
          ticket_number?: number;
          ticket_year?: number;
          type?: Database["public"]["Enums"]["request_type"];
          updated_at?: string;
          version?: number;
          work_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "requests_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "requests_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "requests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "requests_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_form_version_id_fkey";
            columns: ["form_version_id"];
            isOneToOne: false;
            referencedRelation: "form_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_mailbox_recorded_by_fkey";
            columns: ["mailbox_recorded_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "requests_office_city_id_fkey";
            columns: ["office_city_id"];
            isOneToOne: false;
            referencedRelation: "office_cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_office_id_fkey";
            columns: ["office_id"];
            isOneToOne: false;
            referencedRelation: "offices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "country_regions";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_assets: {
        Row: {
          byte_size: number | null;
          created_at: string;
          height: number | null;
          id: string;
          is_active: boolean;
          kind: string;
          retired_at: string | null;
          sha256: string | null;
          source: string;
          storage_path: string | null;
          typed_text: string | null;
          user_id: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          byte_size?: number | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          is_active?: boolean;
          kind: string;
          retired_at?: string | null;
          sha256?: string | null;
          source: string;
          storage_path?: string | null;
          typed_text?: string | null;
          user_id: string;
          width?: number | null;
        };
        Update: {
          byte_size?: number | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          retired_at?: string | null;
          sha256?: string | null;
          source?: string;
          storage_path?: string | null;
          typed_text?: string | null;
          user_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_assets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      signatures: {
        Row: {
          cleared_at: string | null;
          cleared_reason: string | null;
          form_version_id: number;
          id: string;
          note: string | null;
          request_id: string;
          section: string;
          signature_asset_id: string;
          signed_at: string;
          signer_id: string;
          signer_role: Database["public"]["Enums"]["app_role"];
          snapshot_id: string;
        };
        ComputedFields: never;
        Insert: {
          cleared_at?: string | null;
          cleared_reason?: string | null;
          form_version_id: number;
          id?: string;
          note?: string | null;
          request_id: string;
          section: string;
          signature_asset_id: string;
          signed_at?: string;
          signer_id: string;
          signer_role: Database["public"]["Enums"]["app_role"];
          snapshot_id: string;
        };
        Update: {
          cleared_at?: string | null;
          cleared_reason?: string | null;
          form_version_id?: number;
          id?: string;
          note?: string | null;
          request_id?: string;
          section?: string;
          signature_asset_id?: string;
          signed_at?: string;
          signer_id?: string;
          signer_role?: Database["public"]["Enums"]["app_role"];
          snapshot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "signatures_form_version_id_fkey";
            columns: ["form_version_id"];
            isOneToOne: false;
            referencedRelation: "form_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signatures_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signatures_signature_asset_id_fkey";
            columns: ["signature_asset_id"];
            isOneToOne: false;
            referencedRelation: "signature_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signatures_signer_id_fkey";
            columns: ["signer_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "signatures_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "request_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          clerk_user_id: string;
          granted_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
        };
        ComputedFields: never;
        Insert: {
          clerk_user_id: string;
          granted_at?: string;
          granted_by?: string | null;
          role: Database["public"]["Enums"]["app_role"];
        };
        Update: {
          clerk_user_id?: string;
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_clerk_user_id_fkey";
            columns: ["clerk_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_save_access_type: {
        Args: {
          p_actions: string[];
          p_id: number;
          p_name: string;
          p_scopes: string[];
        };
        Returns: number;
      };
      admin_save_ai_model: {
        Args: {
          p_id: number;
          p_model_id: string;
          p_name: string;
          p_note: string;
          p_price_in: number;
          p_price_out: number;
        };
        Returns: number;
      };
      admin_save_ai_settings: {
        Args: {
          p_enabled: boolean;
          p_hourly_limit: number;
          p_model: number;
          p_monthly_budget_usd: number;
        };
        Returns: undefined;
      };
      admin_save_app: {
        Args: {
          p_actions: string[];
          p_category_id: number;
          p_id: number;
          p_multi_permission?: boolean;
          p_name: string;
          p_permissions: string[];
        };
        Returns: number;
      };
      admin_save_category: {
        Args: { p_id: number; p_name: string };
        Returns: number;
      };
      admin_save_equipment_type: {
        Args: {
          p_actions: string[];
          p_id: number;
          p_name: string;
          p_needs_description: boolean;
        };
        Returns: number;
      };
      admin_save_office: {
        Args: {
          p_city: string;
          p_country: string;
          p_id: number;
          p_name: string;
          p_uses_regions: boolean;
        };
        Returns: number;
      };
      admin_save_office_city: {
        Args: {
          p_id: number;
          p_name: string;
          p_office_id: number;
          p_region_id: number;
        };
        Returns: number;
      };
      admin_set_access_type_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      admin_set_ai_model_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      admin_set_app_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      admin_set_category_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      admin_set_equipment_type_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      admin_set_office_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      admin_set_office_city_active: {
        Args: { p_active: boolean; p_id: number };
        Returns: undefined;
      };
      ai_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          asked_last_hour: number;
          enabled: boolean;
          hourly_limit: number;
          model: number;
          model_id: string;
          monthly_budget_usd: number;
          reason: string;
          resets_at: string;
          spent_this_month_usd: number;
        }[];
      };
      ai_usage_this_month: {
        Args: Record<PropertyKey, never>;
        Returns: {
          answers: number;
          people: number;
          spent_usd: number;
        }[];
      };
      approval_preview: { Args: { p_request_id: string }; Returns: Json };
      audit_log: {
        Args: {
          p_actor?: string;
          p_before_at?: string;
          p_before_id?: number;
          p_from?: string;
          p_groups?: string[];
          p_hide_test?: boolean;
          p_limit?: number;
          p_search?: string;
          p_sources?: Database["public"]["Enums"]["audit_source"][];
          p_to?: string;
        };
        Returns: {
          action: string;
          actor_email: string;
          actor_id: string;
          actor_name: string;
          actor_roles: Database["public"]["Enums"]["app_role"][];
          created_at: string;
          diff: Json;
          employee_name: string;
          entity: string;
          entity_id: string;
          group_key: string;
          id: number;
          is_test_user: boolean;
          request_id: string;
          request_type: Database["public"]["Enums"]["request_type"];
          source: Database["public"]["Enums"]["audit_source"];
          ticket_id: string;
          total_count: number;
        }[];
      };
      confirm_request: {
        Args: { p_request_id: string; p_reviewed: Json };
        Returns: string;
      };
      create_access_modification: {
        Args: { p_employee_id?: string };
        Returns: string;
      };
      create_offboarding: { Args: { p_employee_id?: string }; Returns: string };
      delete_my_ai_chats: { Args: Record<PropertyKey, never>; Returns: number };
      export_audit_log: {
        Args: {
          p_actor?: string;
          p_from?: string;
          p_groups?: string[];
          p_hide_test?: boolean;
          p_search?: string;
          p_sources?: Database["public"]["Enums"]["audit_source"][];
          p_to?: string;
        };
        Returns: {
          action: string;
          actor_email: string;
          actor_id: string;
          actor_name: string;
          actor_roles: Database["public"]["Enums"]["app_role"][];
          created_at: string;
          diff: Json;
          employee_name: string;
          entity: string;
          entity_id: string;
          group_key: string;
          id: number;
          is_test_user: boolean;
          request_id: string;
          request_type: Database["public"]["Enums"]["request_type"];
          source: Database["public"]["Enums"]["audit_source"];
          ticket_id: string;
        }[];
      };
      forget_my_ai_memory: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      log_record_download: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      log_report_export: {
        Args: {
          p_filters?: Json;
          p_format: string;
          p_report: string;
          p_rows?: number;
        };
        Returns: undefined;
      };
      my_timezone: { Args: Record<PropertyKey, never>; Returns: string };
      record_ai_usage: {
        Args: {
          p_input_tokens: number;
          p_model: number;
          p_output_tokens: number;
        };
        Returns: number;
      };
      record_pdf: {
        Args: {
          p_byte_size: number;
          p_file_name: string;
          p_request_id: string;
          p_sha256: string;
        };
        Returns: string;
      };
      report_access_by_item: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_kind?: Database["public"]["Enums"]["inventory_kind"];
          p_nationality?: string;
          p_office?: number;
          p_region?: number;
          p_search?: string;
        };
        Returns: {
          catalog_count: number;
          category_name: string;
          holders: number;
          item_key: string;
          items_in_use: number;
          leaving_people: number;
          name: string;
          total_people: number;
          total_rights: number;
        }[];
      };
      report_access_holders: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_item_key?: string;
          p_kind?: Database["public"]["Enums"]["inventory_kind"];
          p_limit?: number;
          p_nationality?: string;
          p_office?: number;
          p_offset?: number;
          p_region?: number;
          p_search?: string;
        };
        Returns: {
          asset_tag: string;
          category_name: string;
          country: string;
          department: string;
          description: string;
          first_name: string;
          granted_at: string;
          granted_request_id: string;
          granted_ticket_id: string;
          inventory_id: string;
          item_key: string;
          last_name: string;
          leaving_request_id: string;
          leaving_ticket_id: string;
          name: string;
          office: string;
          permission: string;
          permission_counts: Json;
          source: string;
          total_count: number;
          work_email: string;
        }[];
      };
      report_all_users: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_from?: string;
          p_limit?: number;
          p_nationality?: string;
          p_office?: number;
          p_offset?: number;
          p_region?: number;
          p_search?: string;
          p_to?: string;
          p_type?: Database["public"]["Enums"]["request_type"];
        };
        Returns: {
          closed_at: string;
          country: string;
          created_at: string;
          department: string;
          effective_date: string;
          first_name: string;
          id: string;
          last_name: string;
          last_working_day: string;
          location: string;
          nationalities: string[];
          office: string;
          people_count: number;
          state: Database["public"]["Enums"]["request_state"];
          ticket_id: string;
          total_count: number;
          type: Database["public"]["Enums"]["request_type"];
          work_email: string;
        }[];
      };
      report_employees: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_limit?: number;
          p_nationality?: string;
          p_office?: number;
          p_offset?: number;
          p_region?: number;
          p_search?: string;
        };
        Returns: {
          city: string;
          country: string;
          department: string;
          employee_id: string;
          first_name: string;
          last_name: string;
          latest_request_id: string;
          latest_ticket_id: string;
          leaving_request_id: string;
          leaving_ticket_id: string;
          nationalities: string[];
          office: string;
          onboarded_at: string;
          region: string;
          total_count: number;
          work_email: string;
        }[];
      };
      report_employees_by_office: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_nationality?: string;
          p_office?: number;
          p_region?: number;
        };
        Returns: {
          city: string;
          city_id: number;
          employees: number;
          leaving: number;
          office: string;
          office_id: number;
          region: string;
          region_id: number;
        }[];
      };
      report_offboarding_sla: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_from?: string;
          p_limit?: number;
          p_nationality?: string;
          p_office?: number;
          p_offset?: number;
          p_region?: number;
          p_search?: string;
          p_to?: string;
        };
        Returns: {
          access_cutoff_at: string;
          first_name: string;
          id: string;
          last_name: string;
          removals_done: number;
          removals_total: number;
          removed_at: string;
          result: string;
          sla_due_at: string;
          sla_missed_reason: string;
          sla_timeline: Database["public"]["Enums"]["sla_timeline"];
          state: Database["public"]["Enums"]["request_state"];
          ticket_id: string;
          total_count: number;
          work_email: string;
        }[];
      };
      report_offboarding_sla_summary: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_from?: string;
          p_nationality?: string;
          p_office?: number;
          p_region?: number;
          p_search?: string;
          p_to?: string;
        };
        Returns: {
          met: number;
          missed: number;
          no_removals: number;
          open: number;
          overdue: number;
          sla_timeline: Database["public"]["Enums"]["sla_timeline"];
        }[];
      };
      report_onboarded_by: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_from?: string;
          p_group: string;
          p_nationality?: string;
          p_office?: number;
          p_region?: number;
          p_to?: string;
        };
        Returns: {
          key: string;
          label: string;
          onboarded: number;
        }[];
      };
      report_onboarded_by_month: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_from_month: string;
          p_nationality?: string;
          p_office?: number;
          p_region?: number;
          p_to_month: string;
        };
        Returns: {
          month: string;
          onboarded: number;
        }[];
      };
      report_open_requests: {
        Args: {
          p_limit?: number;
          p_search?: string;
          p_type?: Database["public"]["Enums"]["request_type"];
        };
        Returns: {
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          sla_due_at: string;
          sla_result: string;
          state: Database["public"]["Enums"]["request_state"];
          ticket_id: string;
          total_count: number;
          type: Database["public"]["Enums"]["request_type"];
          waiting_since: string;
          work_email: string;
        }[];
      };
      report_signature_log: {
        Args: {
          p_city?: number;
          p_country?: string;
          p_department?: number;
          p_from?: string;
          p_limit?: number;
          p_nationality?: string;
          p_office?: number;
          p_offset?: number;
          p_region?: number;
          p_search?: string;
          p_to?: string;
          p_type?: Database["public"]["Enums"]["request_type"];
        };
        Returns: {
          approved_at: string;
          approved_by: string;
          approved_count: number;
          final_sha256: string;
          first_name: string;
          first_signed_at: string;
          first_signed_by: string;
          id: string;
          it_sha256: string;
          last_name: string;
          last_returned_at: string;
          last_signed_at: string;
          median_seconds: number;
          pdf_generated_at: string;
          returned_count: number;
          returns: number;
          state: Database["public"]["Enums"]["request_state"];
          ticket_id: string;
          total_count: number;
          type: Database["public"]["Enums"]["request_type"];
          work_email: string;
        }[];
      };
      request_activity: {
        Args: { p_request_id: string };
        Returns: {
          action: string;
          actor_id: string;
          actor_name: string;
          created_at: string;
          diff: Json;
          flagged_sections: number[];
          id: number;
          note: string;
          source: Database["public"]["Enums"]["audit_source"];
        }[];
      };
      request_signature_marks: {
        Args: { p_request_id: string };
        Returns: {
          kind: string;
          note: string;
          section: string;
          sha256: string;
          signed_at: string;
          signer_name: string;
          signer_role: Database["public"]["Enums"]["app_role"];
          source: string;
          storage_path: string;
          typed_text: string;
        }[];
      };
      request_sla: { Args: { p_request_id: string }; Returns: Json };
      request_snapshot_preview: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      return_request: {
        Args: { p_comment: string; p_flagged?: number[]; p_request_id: string };
        Returns: string;
      };
      set_active_signature: {
        Args: { p_asset_id: string };
        Returns: undefined;
      };
      set_company_timezone: { Args: { p_timezone: string }; Returns: string };
      set_equipment_return: {
        Args: { p_item_id: string; p_reason?: string; p_status: string };
        Returns: undefined;
      };
      set_mailbox_handling: {
        Args: { p_request_id: string; p_value: string };
        Returns: undefined;
      };
      set_my_timezone: { Args: { p_timezone: string }; Returns: string };
      set_removal: {
        Args: {
          p_done?: boolean;
          p_item_id: string;
          p_kind: string;
          p_method?: string;
        };
        Returns: undefined;
      };
      sign_request: {
        Args: { p_note?: string; p_request_id: string; p_reviewed: Json };
        Returns: string;
      };
      signing_checks: { Args: { p_request_id: string }; Returns: Json };
      transition_request: {
        Args: {
          p_reason?: string;
          p_request_id: string;
          p_to: Database["public"]["Enums"]["request_state"];
        };
        Returns: Database["public"]["Enums"]["request_state"];
      };
    };
    Enums: {
      app_role: "admin" | "requester" | "it_operator" | "approver" | "auditor";
      audit_source: "user" | "ai" | "system";
      inventory_kind: "application" | "equipment" | "access";
      request_priority: "low" | "medium" | "high";
      request_state:
        | "draft"
        | "in_execution"
        | "pending_confirmation"
        | "returned"
        | "closed"
        | "cancelled";
      request_type: "onboarding" | "offboarding" | "access_modification";
      sla_timeline: "same_day" | "within_24h" | "within_48h";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "requester", "it_operator", "approver", "auditor"],
      audit_source: ["user", "ai", "system"],
      inventory_kind: ["application", "equipment", "access"],
      request_priority: ["low", "medium", "high"],
      request_state: [
        "draft",
        "in_execution",
        "pending_confirmation",
        "returned",
        "closed",
        "cancelled",
      ],
      request_type: ["onboarding", "offboarding", "access_modification"],
      sla_timeline: ["same_day", "within_24h", "within_48h"],
    },
  },
} as const;
