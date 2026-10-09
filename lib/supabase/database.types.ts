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
      app_users: {
        Row: {
          active: boolean;
          clerk_user_id: string;
          created_at: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          clerk_user_id: string;
          created_at?: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          clerk_user_id?: string;
          created_at?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
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
          name: string;
          permissions: string[];
          sort_order: number;
        };
        Insert: {
          actions: string[];
          active?: boolean;
          category_id: number;
          id?: never;
          name: string;
          permissions: string[];
          sort_order?: number;
        };
        Update: {
          actions?: string[];
          active?: boolean;
          category_id?: number;
          id?: never;
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
      departments: {
        Row: {
          active: boolean;
          id: number;
          name: string;
          sort_order: number;
        };
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
      employees: {
        Row: {
          created_at: string;
          first_name: string | null;
          id: string;
          last_name: string | null;
          updated_at: string;
          work_email: string;
        };
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
        };
        Insert: {
          active?: boolean;
          applies_to: Database["public"]["Enums"]["request_type"][];
          id?: never;
          key: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          applies_to?: Database["public"]["Enums"]["request_type"][];
          id?: never;
          key?: string;
          label?: string;
          sort_order?: number;
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
      physical_access_types: {
        Row: {
          actions: string[];
          active: boolean;
          id: number;
          name: string;
          scopes: string[];
          sort_order: number;
        };
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
          id: string;
          notes: string | null;
          permission: string | null;
          request_id: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          app_id?: number | null;
          app_name: string;
          category_name: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          permission?: string | null;
          request_id: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          app_id?: number | null;
          app_name?: string;
          category_name?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          permission?: string | null;
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
          notes: string | null;
          request_id: string;
          type_id: number;
          type_name: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          asset_tag?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          notes?: string | null;
          request_id: string;
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
          notes?: string | null;
          request_id?: string;
          type_id?: number;
          type_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_equipment_items_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
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
          id: string;
          notes: string | null;
          request_id: string;
          scope: string | null;
          type_id: number;
          type_name: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
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
          id?: string;
          notes?: string | null;
          request_id?: string;
          scope?: string | null;
          type_id?: number;
          type_name?: string;
          updated_at?: string;
        };
        Relationships: [
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
          id: string;
          job_title: string | null;
          last_name: string | null;
          manager_name: string | null;
          priority: Database["public"]["Enums"]["request_priority"];
          requestor_name: string | null;
          return_reason: string | null;
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
        Insert: {
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
          id?: string;
          job_title?: string | null;
          last_name?: string | null;
          manager_name?: string | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          requestor_name?: string | null;
          return_reason?: string | null;
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
          id?: string;
          job_title?: string | null;
          last_name?: string | null;
          manager_name?: string | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          requestor_name?: string | null;
          return_reason?: string | null;
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
      approval_preview: { Args: { p_request_id: string }; Returns: Json };
      confirm_request: {
        Args: { p_request_id: string; p_reviewed: Json };
        Returns: string;
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
      request_priority: "low" | "medium" | "high";
      request_state:
        | "draft"
        | "in_execution"
        | "pending_confirmation"
        | "returned"
        | "closed"
        | "cancelled";
      request_type: "onboarding" | "offboarding" | "access_modification";
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
    },
  },
} as const;
