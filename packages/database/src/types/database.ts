// AUTO-GENERATED via Supabase MCP `generate_typescript_types` (T021).
// Do NOT hand-edit — regenerate after each migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      grade: {
        Row: {
          code: string;
          id: string;
          label_ar: string;
          ordinal: number;
          stage_id: string;
        };
        Insert: {
          code: string;
          id?: string;
          label_ar: string;
          ordinal: number;
          stage_id: string;
        };
        Update: {
          code?: string;
          id?: string;
          label_ar?: string;
          ordinal?: number;
          stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'grade_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'stage';
            referencedColumns: ['id'];
          },
        ];
      };
      school: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      sms_credit_consumption: {
        Row: {
          created_at: string;
          id: string;
          school_id: string;
          segments: number;
          sms_message_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          school_id: string;
          segments: number;
          sms_message_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          school_id?: string;
          segments?: number;
          sms_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sms_credit_consumption_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
      sms_credit_topup: {
        Row: {
          actor_user_id: string;
          amount: number;
          created_at: string;
          id: string;
          idempotency_key: string;
          school_id: string;
        };
        Insert: {
          actor_user_id: string;
          amount: number;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          school_id: string;
        };
        Update: {
          actor_user_id?: string;
          amount?: number;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sms_credit_topup_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sms_credit_topup_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
      stage: {
        Row: {
          code: string;
          id: string;
          label_ar: string;
          ordinal: number;
        };
        Insert: {
          code: string;
          id?: string;
          label_ar: string;
          ordinal: number;
        };
        Update: {
          code?: string;
          id?: string;
          label_ar?: string;
          ordinal?: number;
        };
        Relationships: [];
      };
      subscription: {
        Row: {
          created_at: string;
          grace_days: number;
          id: string;
          period_end: string;
          period_start: string;
          school_id: string;
        };
        Insert: {
          created_at?: string;
          grace_days?: number;
          id?: string;
          period_end: string;
          period_start: string;
          school_id: string;
        };
        Update: {
          created_at?: string;
          grace_days?: number;
          id?: string;
          period_end?: string;
          period_start?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
      user: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          role: Database['public']['Enums']['user_role'];
          school_id: string | null;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          role: Database['public']['Enums']['user_role'];
          school_id?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: Database['public']['Enums']['user_role'];
          school_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assert_writes_allowed: {
        Args: { p_context?: string; p_school_id: string };
        Returns: undefined;
      };
      current_is_super_admin: { Args: never; Returns: boolean };
      current_role: {
        Args: never;
        Returns: Database['public']['Enums']['user_role'];
      };
      current_school_id: { Args: never; Returns: string };
      subscription_state: { Args: { p_school_id: string }; Returns: string };
      topup_sms_credit: {
        Args: {
          p_amount: number;
          p_idempotency_key: string;
          p_school_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: 'super_admin' | 'school_admin' | 'accountant' | 'viewer';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
