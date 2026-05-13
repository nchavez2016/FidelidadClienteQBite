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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          legacy_campaign_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          legacy_campaign_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          legacy_campaign_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          bonus_rules: Json
          branch_id: string
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          legacy_id: string | null
          milestones: Json
          name: string
          start_date: string
          status: Database["public"]["Enums"]["campaign_status"]
          terms_and_conditions: string
          updated_at: string
        }
        Insert: {
          bonus_rules?: Json
          branch_id: string
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          legacy_id?: string | null
          milestones?: Json
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["campaign_status"]
          terms_and_conditions?: string
          updated_at?: string
        }
        Update: {
          bonus_rules?: Json
          branch_id?: string
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          legacy_id?: string | null
          milestones?: Json
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          terms_and_conditions?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_points: {
        Row: {
          campaign_id: string
          customer_id: string
          last_tx_id: string | null
          points: number
          points_lifetime: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          customer_id: string
          last_tx_id?: string | null
          points?: number
          points_lifetime?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          customer_id?: string
          last_tx_id?: string | null
          points?: number
          points_lifetime?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          balance_after: number | null
          bonus_multiplier: number | null
          bonus_rule_id: string | null
          branch_id: string | null
          campaign_id: string
          comment_category: string | null
          comment_text: string | null
          created_at: string
          customer_id: string
          effective_at: string
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata: Json
          points_delta: number
          reverses_tx_id: string | null
          reward_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          balance_after?: number | null
          bonus_multiplier?: number | null
          bonus_rule_id?: string | null
          branch_id?: string | null
          campaign_id: string
          comment_category?: string | null
          comment_text?: string | null
          created_at?: string
          customer_id: string
          effective_at?: string
          id?: string
          idempotency_key?: string | null
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata?: Json
          points_delta: number
          reverses_tx_id?: string | null
          reward_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          balance_after?: number | null
          bonus_multiplier?: number | null
          bonus_rule_id?: string | null
          branch_id?: string | null
          campaign_id?: string
          comment_category?: string | null
          comment_text?: string | null
          created_at?: string
          customer_id?: string
          effective_at?: string
          id?: string
          idempotency_key?: string | null
          kind?: Database["public"]["Enums"]["tx_kind"]
          metadata?: Json
          points_delta?: number
          reverses_tx_id?: string | null
          reward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_reverses_tx_id_fkey"
            columns: ["reverses_tx_id"]
            isOneToOne: false
            referencedRelation: "point_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_campaigns: string[]
          branch_id: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          legacy_id: string | null
          phone: string | null
          revoked_from_phone: string | null
          updated_at: string
        }
        Insert: {
          accepted_campaigns?: string[]
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active?: boolean
          legacy_id?: string | null
          phone?: string | null
          revoked_from_phone?: string | null
          updated_at?: string
        }
        Update: {
          accepted_campaigns?: string[]
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_active?: boolean
          legacy_id?: string | null
          phone?: string | null
          revoked_from_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
      [_ in never]: never
    }
    Functions: {
      accept_campaign_terms: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      adjust_points: {
        Args: {
          p_campaign_id: string
          p_customer_id: string
          p_delta: number
          p_reason: string
        }
        Returns: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          balance_after: number | null
          bonus_multiplier: number | null
          bonus_rule_id: string | null
          branch_id: string | null
          campaign_id: string
          comment_category: string | null
          comment_text: string | null
          created_at: string
          customer_id: string
          effective_at: string
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata: Json
          points_delta: number
          reverses_tx_id: string | null
          reward_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "point_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      earn_points: {
        Args: {
          p_bonus_multiplier?: number
          p_bonus_rule_id?: string
          p_branch_id: string
          p_campaign_id: string
          p_comment_category?: string
          p_comment_text?: string
          p_customer_id: string
          p_idempotency_key: string
        }
        Returns: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          balance_after: number | null
          bonus_multiplier: number | null
          bonus_rule_id: string | null
          branch_id: string | null
          campaign_id: string
          comment_category: string | null
          comment_text: string | null
          created_at: string
          customer_id: string
          effective_at: string
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata: Json
          points_delta: number
          reverses_tx_id: string | null
          reward_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "point_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_actor_display_names: {
        Args: { p_ids: string[] }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_target_id?: string
          p_target_type?: string
        }
        Returns: string
      }
      redeem_reward: {
        Args: {
          p_branch_id: string
          p_campaign_id: string
          p_customer_id: string
          p_idempotency_key: string
          p_required_points: number
          p_reward_id: string
          p_reward_name: string
        }
        Returns: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          balance_after: number | null
          bonus_multiplier: number | null
          bonus_rule_id: string | null
          branch_id: string | null
          campaign_id: string
          comment_category: string | null
          comment_text: string | null
          created_at: string
          customer_id: string
          effective_at: string
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata: Json
          points_delta: number
          reverses_tx_id: string | null
          reward_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "point_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_customer_points: {
        Args: {
          p_campaign_id: string
          p_customer_id: string
          p_reason?: string
        }
        Returns: {
          new_balance: number
          tx_id: string
        }[]
      }
      reverse_transaction: {
        Args: { p_reason?: string; p_tx_id: string }
        Returns: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          balance_after: number | null
          bonus_multiplier: number | null
          bonus_rule_id: string | null
          branch_id: string | null
          campaign_id: string
          comment_category: string | null
          comment_text: string | null
          created_at: string
          customer_id: string
          effective_at: string
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["tx_kind"]
          metadata: Json
          points_delta: number
          reverses_tx_id: string | null
          reward_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "point_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "cashier" | "customer"
      campaign_status: "draft" | "active" | "paused" | "finished"
      gender_type: "masculino" | "femenino" | "otro"
      tx_kind:
        | "earn"
        | "bonus"
        | "redeem"
        | "manual_adjustment"
        | "reversal"
        | "terms_acceptance"
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
      app_role: ["admin", "cashier", "customer"],
      campaign_status: ["draft", "active", "paused", "finished"],
      gender_type: ["masculino", "femenino", "otro"],
      tx_kind: [
        "earn",
        "bonus",
        "redeem",
        "manual_adjustment",
        "reversal",
        "terms_acceptance",
      ],
    },
  },
} as const
