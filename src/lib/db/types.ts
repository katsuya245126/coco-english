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
          review_policy: "every_submission" | "flagged_only";
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          join_code?: string | null;
          data_mode: "demo" | "real";
          review_policy?: "every_submission" | "flagged_only";
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
          scene_premise: string | null;
          conversation_mode: boolean;
          require_complete_sentence_answers: boolean;
          archived_at: string | null;
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
          scene_premise?: string | null;
          conversation_mode?: boolean;
          require_complete_sentence_answers?: boolean;
          archived_at?: string | null;
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
          answer_shape: "fixed" | "open";
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
          answer_shape?: "fixed" | "open";
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
          canceled_at: string | null;
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
          canceled_at?: string | null;
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
      attempts: {
        Row: {
          id: string;
          assignment_student_id: string;
          status: Database["public"]["Enums"]["attempt_status"];
          started_at: string;
          completed_at: string | null;
          needs_review_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_student_id: string;
          status?: Database["public"]["Enums"]["attempt_status"];
          started_at?: string;
          completed_at?: string | null;
          needs_review_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attempts"]["Insert"]>;
        Relationships: [];
      };
      attempt_turns: {
        Row: {
          id: string;
          attempt_id: string;
          mission_turn_template_id: string | null;
          turn_order: number;
          original_transcript: string | null;
          improved_sentence: string | null;
          repeat_transcript: string | null;
          evaluation: Json;
          target_attempted: boolean | null;
          repeat_accepted: boolean | null;
          hint_level_used: number;
          coco_line: string | null;
          moderation_event: Json | null;
          reply_hint_frame: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          mission_turn_template_id?: string | null;
          turn_order: number;
          original_transcript?: string | null;
          improved_sentence?: string | null;
          repeat_transcript?: string | null;
          evaluation?: Json;
          target_attempted?: boolean | null;
          repeat_accepted?: boolean | null;
          hint_level_used?: number;
          coco_line?: string | null;
          moderation_event?: Json | null;
          reply_hint_frame?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attempt_turns"]["Insert"]>;
        Relationships: [];
      };
      audio_clips: {
        Row: {
          id: string;
          attempt_turn_id: string;
          clip_kind: Database["public"]["Enums"]["audio_clip_kind"];
          object_key: string | null;
          mime_type: string | null;
          duration_ms: number | null;
          byte_size: number | null;
          processing_status: Database["public"]["Enums"]["audio_processing_status"];
          audio_expires_at: string;
          deleted_at: string | null;
          deleted_reason: string | null;
          pronunciation_reprocessing_started_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attempt_turn_id: string;
          clip_kind: Database["public"]["Enums"]["audio_clip_kind"];
          object_key?: string | null;
          mime_type?: string | null;
          duration_ms?: number | null;
          byte_size?: number | null;
          processing_status?: Database["public"]["Enums"]["audio_processing_status"];
          audio_expires_at?: string;
          deleted_at?: string | null;
          deleted_reason?: string | null;
          pronunciation_reprocessing_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audio_clips"]["Insert"]>;
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
      submission_review_receipts: {
        Row: { id: string; teacher_id: string; attempt_id: string; first_viewed_at: string | null; reviewed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; teacher_id: string; attempt_id: string; first_viewed_at?: string | null; reviewed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["submission_review_receipts"]["Insert"]>;
        Relationships: [];
      };
      translation_hint_cache: {
        Row: {
          id: string;
          source_digest: string;
          student_level: string;
          target_locale: string;
          phrases: Json;
          created_at: string;
          last_accessed_at: string;
        };
        Insert: {
          id?: string;
          source_digest: string;
          student_level: string;
          target_locale: string;
          phrases: Json;
          created_at?: string;
          last_accessed_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["translation_hint_cache"]["Insert"]
        >;
        Relationships: [];
      };
      tts_audio_cache: {
        Row: {
          id: string;
          content_hash: string;
          provider: string;
          model: string;
          voice: string;
          response_format: string;
          character_id: string;
          object_key: string;
          mime_type: string;
          byte_size: number;
          created_at: string;
          last_accessed_at: string;
        };
        Insert: {
          id?: string;
          content_hash: string;
          provider: string;
          model: string;
          voice: string;
          response_format: string;
          character_id: string;
          object_key: string;
          mime_type: string;
          byte_size: number;
          created_at?: string;
          last_accessed_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["tts_audio_cache"]["Insert"]
        >;
        Relationships: [];
      };
      student_unlock_attempts: {
        Row: {
          target_digest: string;
          network_digest: string;
          window_started_at: string;
          attempt_count: number;
          updated_at: string;
        };
        Insert: {
          target_digest: string;
          network_digest: string;
          window_started_at?: string;
          attempt_count?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["student_unlock_attempts"]["Insert"]
        >;
        Relationships: [];
      };
      request_budgets: {
        Row: {
          actor_digest: string;
          operation:
            | "student_audio"
            | "student_helper"
            | "teacher_provider"
            | "evaluator_warmup";
          window_started_at: string;
          request_count: number;
          updated_at: string;
        };
        Insert: {
          actor_digest: string;
          operation:
            | "student_audio"
            | "student_helper"
            | "teacher_provider"
            | "evaluator_warmup";
          window_started_at?: string;
          request_count?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["request_budgets"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      assign_mission_to_class: {
        Args: {
          p_class_id: string;
          p_mission_id: string;
          p_mission_snapshot: Json;
          p_due_at?: string | null;
        };
        Returns: {
          out_assignment_id: string;
          out_active_student_count: number;
          out_class_name: string;
        }[];
      };
      complete_student_attempt: {
        Args: {
          p_student_id: string;
          p_assignment_student_id: string;
          p_attempt_id: string;
        };
        Returns: "ok" | "not_found" | "not_complete";
      };
      mark_submission_reviewed: {
        Args: { p_teacher_id: string; p_attempt_id: string };
        Returns: "ok" | "not_found" | "invalid_status";
      };
      request_submission_retry: {
        Args: { p_teacher_id: string; p_attempt_id: string; p_reason_note: string };
        Returns: "ok" | "not_found" | "invalid_status";
      };
      consume_student_unlock_attempt: {
        Args: {
          p_target_digest: string;
          p_network_digest: string;
        };
        Returns: boolean;
      };
      consume_request_budget: {
        Args: {
          p_actor_digest: string;
          p_operation: string;
          p_request_limit: number;
          p_window_seconds: number;
        };
        Returns: {
          permitted: boolean;
          retry_after_seconds: number;
        }[];
      };
      begin_pronunciation_reprocessing: {
        Args: { p_teacher_id: string; p_audio_clip_id: string };
        Returns: {
          outcome: string;
          object_key: string | null;
          duration_ms: number | null;
          reference_text: string | null;
        }[];
      };
      complete_pronunciation_reprocessing: {
        Args: {
          p_teacher_id: string;
          p_audio_clip_id: string;
          p_accuracy_score: number;
          p_fluency_score: number | null;
          p_completeness_score: number | null;
          p_pronunciation_score: number;
          p_star_band: number;
          p_word_scores: Json;
        };
        Returns: "ok" | "already_scored" | "not_found";
      };
      clear_pronunciation_reprocessing: {
        Args: { p_teacher_id: string; p_audio_clip_id: string };
        Returns: "ok" | "not_found";
      };
    };
    Enums: {
      data_mode: "demo" | "real";
      class_review_policy: "every_submission" | "flagged_only";
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

// ─── Phase 4 row types (mirror foundation schema columns) ───

export type AttemptRow = {
  id: string;
  assignment_student_id: string;
  status: Database["public"]["Enums"]["attempt_status"];
  started_at: string;
  completed_at: string | null;
  needs_review_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AttemptTurnRow = {
  id: string;
  attempt_id: string;
  mission_turn_template_id: string | null;
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  repeat_transcript: string | null;
  evaluation: Json;
  target_attempted: boolean | null;
  repeat_accepted: boolean | null;
  hint_level_used: number;
  created_at: string;
  updated_at: string;
};

export type AssignmentStudentRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: Database["public"]["Enums"]["assignment_student_status"];
  attempt_count: number;
  submitted_at: string | null;
  highest_hint_level: number;
  latest_attempt_id: string | null;
  created_at: string;
  updated_at: string;
};
