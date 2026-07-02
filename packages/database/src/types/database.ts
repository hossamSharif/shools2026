// AUTO-GENERATED via Supabase MCP `generate_typescript_types` (T021/T139).
// Do NOT hand-edit — regenerate after each migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academic_year: {
        Row: { created_at: string; id: string; is_current: boolean; label: string; school_id: string }
        Insert: { created_at?: string; id?: string; is_current?: boolean; label: string; school_id: string }
        Update: { created_at?: string; id?: string; is_current?: boolean; label?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "academic_year_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      account: {
        Row: { account_number: string | null; created_at: string; id: string; name: string; opening_balance: number; school_id: string; type: Database["public"]["Enums"]["account_type"] }
        Insert: { account_number?: string | null; created_at?: string; id?: string; name: string; opening_balance?: number; school_id: string; type: Database["public"]["Enums"]["account_type"] }
        Update: { account_number?: string | null; created_at?: string; id?: string; name?: string; opening_balance?: number; school_id?: string; type?: Database["public"]["Enums"]["account_type"] }
        Relationships: [
          { foreignKeyName: "account_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      audit_entry: {
        Row: { action: string; actor_user_id: string; created_at: string; id: string; money_event_id: string | null; school_id: string }
        Insert: { action: string; actor_user_id: string; created_at?: string; id?: string; money_event_id?: string | null; school_id: string }
        Update: { action?: string; actor_user_id?: string; created_at?: string; id?: string; money_event_id?: string | null; school_id?: string }
        Relationships: [
          { foreignKeyName: "audit_entry_actor_user_id_fkey"; columns: ["actor_user_id"]; isOneToOne: false; referencedRelation: "user"; referencedColumns: ["id"] },
          { foreignKeyName: "audit_entry_money_event_id_fkey"; columns: ["money_event_id"]; isOneToOne: false; referencedRelation: "money_event"; referencedColumns: ["id"] },
          { foreignKeyName: "audit_entry_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      discount: {
        Row: { actor_user_id: string; computed_amount: number; created_at: string; id: string; idempotency_key: string; installment_id: string | null; kind: Database["public"]["Enums"]["discount_kind"]; reason: string | null; school_id: string; student_id: string; value: number }
        Insert: { actor_user_id: string; computed_amount: number; created_at?: string; id?: string; idempotency_key: string; installment_id?: string | null; kind: Database["public"]["Enums"]["discount_kind"]; reason?: string | null; school_id: string; student_id: string; value: number }
        Update: { actor_user_id?: string; computed_amount?: number; created_at?: string; id?: string; idempotency_key?: string; installment_id?: string | null; kind?: Database["public"]["Enums"]["discount_kind"]; reason?: string | null; school_id?: string; student_id?: string; value?: number }
        Relationships: [
          { foreignKeyName: "discount_actor_user_id_fkey"; columns: ["actor_user_id"]; isOneToOne: false; referencedRelation: "user"; referencedColumns: ["id"] },
          { foreignKeyName: "discount_installment_id_fkey"; columns: ["installment_id"]; isOneToOne: false; referencedRelation: "installment"; referencedColumns: ["id"] },
          { foreignKeyName: "discount_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "discount_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "student"; referencedColumns: ["id"] },
        ]
      }
      enrollment: {
        Row: { academic_year_id: string; created_at: string; grade_id: string; id: string; school_id: string; section_id: string; student_id: string }
        Insert: { academic_year_id: string; created_at?: string; grade_id: string; id?: string; school_id: string; section_id: string; student_id: string }
        Update: { academic_year_id?: string; created_at?: string; grade_id?: string; id?: string; school_id?: string; section_id?: string; student_id?: string }
        Relationships: [
          { foreignKeyName: "enrollment_academic_year_id_fkey"; columns: ["academic_year_id"]; isOneToOne: false; referencedRelation: "academic_year"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollment_grade_id_fkey"; columns: ["grade_id"]; isOneToOne: false; referencedRelation: "grade"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollment_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollment_section_id_fkey"; columns: ["section_id"]; isOneToOne: false; referencedRelation: "section"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollment_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "student"; referencedColumns: ["id"] },
        ]
      }
      fee_item: {
        Row: { amount: number; fee_structure_id: string; id: string; name: string; school_id: string }
        Insert: { amount: number; fee_structure_id: string; id?: string; name: string; school_id: string }
        Update: { amount?: number; fee_structure_id?: string; id?: string; name?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "fee_item_fee_structure_id_fkey"; columns: ["fee_structure_id"]; isOneToOne: false; referencedRelation: "fee_structure"; referencedColumns: ["id"] },
          { foreignKeyName: "fee_item_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      fee_structure: {
        Row: { academic_year_id: string; created_at: string; grade_id: string; id: string; school_id: string }
        Insert: { academic_year_id: string; created_at?: string; grade_id: string; id?: string; school_id: string }
        Update: { academic_year_id?: string; created_at?: string; grade_id?: string; id?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "fee_structure_academic_year_id_fkey"; columns: ["academic_year_id"]; isOneToOne: false; referencedRelation: "academic_year"; referencedColumns: ["id"] },
          { foreignKeyName: "fee_structure_grade_id_fkey"; columns: ["grade_id"]; isOneToOne: false; referencedRelation: "grade"; referencedColumns: ["id"] },
          { foreignKeyName: "fee_structure_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      grade: {
        Row: { code: string; id: string; label_ar: string; ordinal: number; stage_id: string }
        Insert: { code: string; id?: string; label_ar: string; ordinal: number; stage_id: string }
        Update: { code?: string; id?: string; label_ar?: string; ordinal?: number; stage_id?: string }
        Relationships: [
          { foreignKeyName: "grade_stage_id_fkey"; columns: ["stage_id"]; isOneToOne: false; referencedRelation: "stage"; referencedColumns: ["id"] },
        ]
      }
      installment: {
        Row: { amount_charged: number; created_at: string; due_date: string; enrollment_id: string | null; id: string; is_carried_in: boolean; school_id: string; sequence: number; student_id: string }
        Insert: { amount_charged: number; created_at?: string; due_date: string; enrollment_id?: string | null; id?: string; is_carried_in?: boolean; school_id: string; sequence: number; student_id: string }
        Update: { amount_charged?: number; created_at?: string; due_date?: string; enrollment_id?: string | null; id?: string; is_carried_in?: boolean; school_id?: string; sequence?: number; student_id?: string }
        Relationships: [
          { foreignKeyName: "installment_enrollment_id_fkey"; columns: ["enrollment_id"]; isOneToOne: false; referencedRelation: "enrollment"; referencedColumns: ["id"] },
          { foreignKeyName: "installment_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "installment_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "student"; referencedColumns: ["id"] },
        ]
      }
      installment_schedule: {
        Row: { amount: number; due_date: string; fee_structure_id: string; id: string; school_id: string; sequence: number }
        Insert: { amount: number; due_date: string; fee_structure_id: string; id?: string; school_id: string; sequence: number }
        Update: { amount?: number; due_date?: string; fee_structure_id?: string; id?: string; school_id?: string; sequence?: number }
        Relationships: [
          { foreignKeyName: "installment_schedule_fee_structure_id_fkey"; columns: ["fee_structure_id"]; isOneToOne: false; referencedRelation: "fee_structure"; referencedColumns: ["id"] },
          { foreignKeyName: "installment_schedule_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      money_event: {
        Row: { account_id: string | null; actor_user_id: string; amount: number; attachment_path: string | null; category: string | null; created_at: string; description: string | null; event_type: Database["public"]["Enums"]["money_event_type"]; from_account_id: string | null; id: string; idempotency_key: string; notes: string | null; occurred_at: string; receipt_no: number | null; reverses_event_id: string | null; school_id: string; student_id: string | null; to_account_id: string | null; vendor: string | null }
        Insert: { account_id?: string | null; actor_user_id: string; amount: number; attachment_path?: string | null; category?: string | null; created_at?: string; description?: string | null; event_type: Database["public"]["Enums"]["money_event_type"]; from_account_id?: string | null; id?: string; idempotency_key: string; notes?: string | null; occurred_at?: string; receipt_no?: number | null; reverses_event_id?: string | null; school_id: string; student_id?: string | null; to_account_id?: string | null; vendor?: string | null }
        Update: { account_id?: string | null; actor_user_id?: string; amount?: number; attachment_path?: string | null; category?: string | null; created_at?: string; description?: string | null; event_type?: Database["public"]["Enums"]["money_event_type"]; from_account_id?: string | null; id?: string; idempotency_key?: string; notes?: string | null; occurred_at?: string; receipt_no?: number | null; reverses_event_id?: string | null; school_id?: string; student_id?: string | null; to_account_id?: string | null; vendor?: string | null }
        Relationships: [
          { foreignKeyName: "money_event_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "account"; referencedColumns: ["id"] },
          { foreignKeyName: "money_event_actor_user_id_fkey"; columns: ["actor_user_id"]; isOneToOne: false; referencedRelation: "user"; referencedColumns: ["id"] },
          { foreignKeyName: "money_event_from_account_id_fkey"; columns: ["from_account_id"]; isOneToOne: false; referencedRelation: "account"; referencedColumns: ["id"] },
          { foreignKeyName: "money_event_reverses_event_id_fkey"; columns: ["reverses_event_id"]; isOneToOne: false; referencedRelation: "money_event"; referencedColumns: ["id"] },
          { foreignKeyName: "money_event_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "money_event_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "student"; referencedColumns: ["id"] },
          { foreignKeyName: "money_event_to_account_id_fkey"; columns: ["to_account_id"]; isOneToOne: false; referencedRelation: "account"; referencedColumns: ["id"] },
        ]
      }
      payment_allocation: {
        Row: { amount: number; created_at: string; id: string; installment_id: string; money_event_id: string; school_id: string }
        Insert: { amount: number; created_at?: string; id?: string; installment_id: string; money_event_id: string; school_id: string }
        Update: { amount?: number; created_at?: string; id?: string; installment_id?: string; money_event_id?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "payment_allocation_installment_id_fkey"; columns: ["installment_id"]; isOneToOne: false; referencedRelation: "installment"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_allocation_money_event_id_fkey"; columns: ["money_event_id"]; isOneToOne: false; referencedRelation: "money_event"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_allocation_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      notification: {
        Row: { created_at: string; id: string; payload: Json; read_at: string | null; school_id: string; type: Database["public"]["Enums"]["notification_type"]; user_id: string }
        Insert: { created_at?: string; id?: string; payload?: Json; read_at?: string | null; school_id: string; type: Database["public"]["Enums"]["notification_type"]; user_id: string }
        Update: { created_at?: string; id?: string; payload?: Json; read_at?: string | null; school_id?: string; type?: Database["public"]["Enums"]["notification_type"]; user_id?: string }
        Relationships: [
          { foreignKeyName: "notification_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "notification_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "user"; referencedColumns: ["id"] },
        ]
      }
      receipt_counter: {
        Row: { next_value: number; school_id: string }
        Insert: { next_value?: number; school_id: string }
        Update: { next_value?: number; school_id?: string }
        Relationships: [
          { foreignKeyName: "receipt_counter_school_id_fkey"; columns: ["school_id"]; isOneToOne: true; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      reminder_rule: {
        Row: { created_at: string; days: number; enabled: boolean; id: string; offset_kind: string; school_id: string; updated_at: string }
        Insert: { created_at?: string; days?: number; enabled?: boolean; id?: string; offset_kind: string; school_id: string; updated_at?: string }
        Update: { created_at?: string; days?: number; enabled?: boolean; id?: string; offset_kind?: string; school_id?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "reminder_rule_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      school: {
        Row: { created_at: string; id: string; name: string }
        Insert: { created_at?: string; id?: string; name: string }
        Update: { created_at?: string; id?: string; name?: string }
        Relationships: []
      }
      section: {
        Row: { created_at: string; grade_id: string; id: string; name: string; school_id: string }
        Insert: { created_at?: string; grade_id: string; id?: string; name: string; school_id: string }
        Update: { created_at?: string; grade_id?: string; id?: string; name?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "section_grade_id_fkey"; columns: ["grade_id"]; isOneToOne: false; referencedRelation: "grade"; referencedColumns: ["id"] },
          { foreignKeyName: "section_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      sms_credit_consumption: {
        Row: { created_at: string; id: string; school_id: string; segments: number; sms_message_id: string | null }
        Insert: { created_at?: string; id?: string; school_id: string; segments: number; sms_message_id?: string | null }
        Update: { created_at?: string; id?: string; school_id?: string; segments?: number; sms_message_id?: string | null }
        Relationships: [
          { foreignKeyName: "sms_credit_consumption_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "sms_credit_consumption_sms_message_id_fkey"; columns: ["sms_message_id"]; isOneToOne: false; referencedRelation: "sms_message_log"; referencedColumns: ["id"] },
        ]
      }
      sms_credit_topup: {
        Row: { actor_user_id: string; amount: number; created_at: string; id: string; idempotency_key: string; school_id: string }
        Insert: { actor_user_id: string; amount: number; created_at?: string; id?: string; idempotency_key: string; school_id: string }
        Update: { actor_user_id?: string; amount?: number; created_at?: string; id?: string; idempotency_key?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "sms_credit_topup_actor_user_id_fkey"; columns: ["actor_user_id"]; isOneToOne: false; referencedRelation: "user"; referencedColumns: ["id"] },
          { foreignKeyName: "sms_credit_topup_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      sms_message_log: {
        Row: { created_at: string; id: string; idempotency_key: string; is_manual: boolean; message_text: string; provider_message_id: string | null; recipient_phone: string; school_id: string; segments: number; status: string; student_id: string; updated_at: string }
        Insert: { created_at?: string; id?: string; idempotency_key: string; is_manual?: boolean; message_text: string; provider_message_id?: string | null; recipient_phone: string; school_id: string; segments: number; status?: string; student_id: string; updated_at?: string }
        Update: { created_at?: string; id?: string; idempotency_key?: string; is_manual?: boolean; message_text?: string; provider_message_id?: string | null; recipient_phone?: string; school_id?: string; segments?: number; status?: string; student_id?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "sms_message_log_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
          { foreignKeyName: "sms_message_log_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "student"; referencedColumns: ["id"] },
        ]
      }
      stage: {
        Row: { code: string; id: string; label_ar: string; ordinal: number }
        Insert: { code: string; id?: string; label_ar: string; ordinal: number }
        Update: { code?: string; id?: string; label_ar?: string; ordinal?: number }
        Relationships: []
      }
      student: {
        Row: { created_at: string; guardian_name: string | null; guardian_phone: string | null; id: string; name: string; photo_path: string | null; school_id: string; status: Database["public"]["Enums"]["student_status"] }
        Insert: { created_at?: string; guardian_name?: string | null; guardian_phone?: string | null; id?: string; name: string; photo_path?: string | null; school_id: string; status?: Database["public"]["Enums"]["student_status"] }
        Update: { created_at?: string; guardian_name?: string | null; guardian_phone?: string | null; id?: string; name?: string; photo_path?: string | null; school_id?: string; status?: Database["public"]["Enums"]["student_status"] }
        Relationships: [
          { foreignKeyName: "student_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      subscription: {
        Row: { created_at: string; grace_days: number; id: string; period_end: string; period_start: string; school_id: string }
        Insert: { created_at?: string; grace_days?: number; id?: string; period_end: string; period_start: string; school_id: string }
        Update: { created_at?: string; grace_days?: number; id?: string; period_end?: string; period_start?: string; school_id?: string }
        Relationships: [
          { foreignKeyName: "subscription_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "school"; referencedColumns: ["id"] },
        ]
      }
      user: {
        Row: { created_at: string; display_name: string; id: string; role: Database["public"]["Enums"]["user_role"]; school_id: string | null }
        Insert: { created_at?: string; display_name: string; id: string; role: Database["public"]["Enums"]["user_role"]; school_id?: string | null }
        Update: { created_at?: string; display_name?: string; id?: string; role?: Database["public"]["Enums"]["user_role"]; school_id?: string | null }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      account_balance: { Args: { p_account_id: string }; Returns: number }
      apply_discount: { Args: { p_idempotency_key: string; p_installment_id?: string; p_kind: Database["public"]["Enums"]["discount_kind"]; p_reason?: string; p_student_id: string; p_value: number }; Returns: Json }
      apply_fee_payment: { Args: { p_account_id: string; p_allocations?: Json; p_amount: number; p_attachment_path?: string; p_idempotency_key: string; p_occurred_at: string; p_student_id: string }; Returns: Json }
      assert_writes_allowed: { Args: { p_context?: string; p_school_id: string }; Returns: undefined }
      check_low_sms_credit: { Args: { p_school_id: string; p_threshold?: number }; Returns: undefined }
      consume_sms_credit: { Args: { p_idempotency_key: string; p_school_id: string; p_segments: number; p_sms_message_id: string }; Returns: Json }
      current_is_super_admin: { Args: never; Returns: boolean }
      current_role: { Args: never; Returns: Database["public"]["Enums"]["user_role"] }
      current_school_id: { Args: never; Returns: string }
      dashboard_kpis: { Args: { p_school_id: string }; Returns: Json }
      emit_expiry_notifications: { Args: { p_within_days?: number }; Returns: number }
      emit_notification: { Args: { p_payload?: Json; p_school_id: string; p_type: Database["public"]["Enums"]["notification_type"]; p_user_id: string }; Returns: string }
      generate_installments: { Args: { p_enrollment_id: string }; Returns: number }
      installment_running_balance: { Args: { p_installment_id: string }; Returns: number }
      mark_notification_read: { Args: { p_notification_id?: string }; Returns: undefined }
      receivables_aging: { Args: { p_grade_id?: string; p_school_id: string; p_section_id?: string; p_stage_id?: string }; Returns: { bucket_1_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number; current_amount: number; grade_id: string; grade_label: string; section_id: string; section_name: string; status: string; student_id: string; student_name: string; total_owed: number }[] }
      record_adjustment: { Args: { p_amount: number; p_idempotency_key: string; p_occurred_at: string; p_reason: string; p_student_id: string }; Returns: Json }
      record_expense: { Args: { p_account_id: string; p_amount: number; p_attachment_path?: string; p_category: string; p_description?: string; p_idempotency_key: string; p_occurred_at: string; p_vendor?: string }; Returns: Json }
      record_opening_balance: { Args: { p_amount: number; p_due_date?: string; p_student_id: string }; Returns: string }
      record_refund: { Args: { p_account_id: string; p_amount: number; p_attachment_path?: string; p_description?: string; p_idempotency_key: string; p_occurred_at: string; p_student_id: string }; Returns: Json }
      record_transfer: { Args: { p_amount: number; p_description?: string; p_from_account_id: string; p_idempotency_key: string; p_occurred_at: string; p_to_account_id: string }; Returns: Json }
      reverse_event: { Args: { p_idempotency_key: string; p_money_event_id: string; p_reason: string }; Returns: Json }
      sms_credit_balance: { Args: { p_school_id: string }; Returns: number }
      student_balance: { Args: { p_student_id: string }; Returns: number }
      student_statement: { Args: { p_student_id: string }; Returns: { charge: number; credit: number; description: string; entry_date: string; entry_type: string; running_balance: number }[] }
      subscription_state: { Args: { p_school_id: string }; Returns: string }
      topup_sms_credit: { Args: { p_amount: number; p_idempotency_key: string; p_school_id: string }; Returns: Json }
    }
    Enums: {
      account_type: "cash" | "bank"
      discount_kind: "percentage" | "fixed" | "sibling_waiver"
      money_event_type: "fee_payment" | "expense" | "transfer" | "refund" | "adjustment"
      notification_type: "payment_recorded" | "low_sms_credit" | "subscription_expiring"
      student_status: "active" | "withdrawn" | "graduated"
      user_role: "super_admin" | "school_admin" | "accountant" | "viewer"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["cash", "bank"],
      discount_kind: ["percentage", "fixed", "sibling_waiver"],
      money_event_type: ["fee_payment", "expense", "transfer", "refund", "adjustment"],
      student_status: ["active", "withdrawn", "graduated"],
      user_role: ["super_admin", "school_admin", "accountant", "viewer"],
    },
  },
} as const
