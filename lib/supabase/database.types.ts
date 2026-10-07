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
      requests: {
        Row: {
          assignee_id: string | null;
          closed_at: string | null;
          country: string | null;
          created_at: string;
          created_by: string;
          custom_fields: NonNullable<Json>;
          department_id: number | null;
          effective_date: string | null;
          employee_id: string | null;
          first_name: string | null;
          form_version_id: number;
          id: string;
          job_title: string | null;
          last_name: string | null;
          manager_name: string | null;
          priority: Database["public"]["Enums"]["request_priority"];
          requestor_name: string | null;
          state: Database["public"]["Enums"]["request_state"];
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
          closed_at?: string | null;
          country?: string | null;
          created_at?: string;
          created_by: string;
          custom_fields?: NonNullable<Json>;
          department_id?: number | null;
          effective_date?: string | null;
          employee_id?: string | null;
          first_name?: string | null;
          form_version_id: number;
          id?: string;
          job_title?: string | null;
          last_name?: string | null;
          manager_name?: string | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          requestor_name?: string | null;
          state?: Database["public"]["Enums"]["request_state"];
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
          closed_at?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string;
          custom_fields?: NonNullable<Json>;
          department_id?: number | null;
          effective_date?: string | null;
          employee_id?: string | null;
          first_name?: string | null;
          form_version_id?: number;
          id?: string;
          job_title?: string | null;
          last_name?: string | null;
          manager_name?: string | null;
          priority?: Database["public"]["Enums"]["request_priority"];
          requestor_name?: string | null;
          state?: Database["public"]["Enums"]["request_state"];
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
      [_ in never]: never;
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
