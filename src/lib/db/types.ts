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
      teacher_profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          display_name: string | null;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          display_name?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          display_name?: string | null;
        };
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          join_code: string | null;
          data_mode: "demo" | "real";
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          join_code?: string | null;
          data_mode: "demo" | "real";
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Insert"]>;
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          class_id: string;
          display_name: string;
          pin_hash: string | null;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          class_id: string;
          display_name: string;
          pin_hash?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["students"]["Insert"]>;
        Relationships: [];
      };
      missions: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          target_pattern: string;
          topic: string;
          level: string;
          required_turns: number;
          character_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title: string;
          target_pattern: string;
          topic: string;
          level: string;
          required_turns: number;
          character_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["missions"]["Insert"]>;
        Relationships: [];
      };
      mission_turn_templates: {
        Row: {
          id: string;
          mission_id: string;
          turn_order: number;
          prompt: string;
          target_example: string;
          hint_ladder: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          turn_order: number;
          prompt: string;
          target_example: string;
          hint_ladder?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["mission_turn_templates"]["Insert"]
        >;
        Relationships: [];
      };
      assignments: {
        Row: {
          id: string;
          class_id: string;
          mission_id: string;
          title: string;
          mission_snapshot: Json;
          data_mode: "demo" | "real";
          assigned_at: string;
          due_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          mission_id: string;
          title: string;
          mission_snapshot: Json;
          data_mode: "demo" | "real";
          due_at?: string | null;
          assigned_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignments"]["Insert"]>;
        Relationships: [];
      };
      assignment_students: {
        Row: {
          id: string;
          assignment_id: string;
          student_id: string;
          status:
            | "assigned"
            | "started"
            | "completed"
            | "missed"
            | "needs_retry"
            | "teacher_review";
        };
        Insert: {
          id?: string;
          assignment_id: string;
          student_id: string;
          status?: Database["public"]["Tables"]["assignment_students"]["Row"]["status"];
        };
        Update: Partial<
          Database["public"]["Tables"]["assignment_students"]["Insert"]
        >;
        Relationships: [];
      };
      assignment_status_events: {
        Row: { id: string; assignment_student_id: string };
        Insert: {
          id?: string;
          assignment_student_id: string;
          previous_status?: string | null;
          next_status: string;
          actor_type: string;
          actor_id?: string | null;
          reason_code: string;
          metadata?: Json;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      data_mode: "demo" | "real";
      assignment_student_status:
        | "assigned"
        | "started"
        | "completed"
        | "missed"
        | "needs_retry"
        | "teacher_review";
      attempt_status:
        | "in_progress"
        | "completed"
        | "abandoned"
        | "needs_retry"
        | "teacher_review";
      audio_clip_kind: "original_answer" | "repeat_attempt";
      audio_processing_status:
        | "pending_upload"
        | "uploaded"
        | "transcribed"
        | "failed"
        | "deleted";
      status_actor_type:
        | "system"
        | "teacher"
        | "student_session"
        | "job"
        | "ai_evaluator";
    };
    CompositeTypes: Record<string, never>;
  };
};
