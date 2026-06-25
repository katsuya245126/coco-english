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
        Row: { id: string; display_name: string | null };
        Insert: { id?: string; display_name?: string | null };
        Update: { display_name?: string | null };
      };
      classes: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          data_mode: "demo" | "real";
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          data_mode: "demo" | "real";
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Insert"]>;
      };
      students: {
        Row: { id: string; class_id: string; display_name: string };
        Insert: { id?: string; class_id: string; display_name: string };
        Update: Partial<Database["public"]["Tables"]["students"]["Insert"]>;
      };
      missions: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          character_id: string;
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
        };
        Update: Partial<Database["public"]["Tables"]["missions"]["Insert"]>;
      };
      mission_turn_templates: {
        Row: { id: string; mission_id: string; turn_order: number };
        Insert: {
          id?: string;
          mission_id: string;
          turn_order: number;
          prompt: string;
          target_example: string;
          hint_ladder?: Json;
        };
        Update: Partial<
          Database["public"]["Tables"]["mission_turn_templates"]["Insert"]
        >;
      };
      assignments: {
        Row: {
          id: string;
          class_id: string;
          mission_id: string;
          title: string;
          data_mode: "demo" | "real";
        };
        Insert: {
          id?: string;
          class_id: string;
          mission_id: string;
          title: string;
          mission_snapshot: Json;
          data_mode: "demo" | "real";
          due_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["assignments"]["Insert"]>;
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
