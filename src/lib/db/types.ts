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
          target_pattern: string | null;
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
          target_pattern: string | null;
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
          target_pattern: string | null;
          target_example: string;
          hint_ladder: Json;
          answer_shape: "fixed" | "open";
          picture_object_key: string | null;
          picture_description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          turn_order: number;
          prompt: string;
          target_pattern?: string | null;
          target_example: string;
          hint_ladder?: Json;
          answer_shape?: "fixed" | "open";
          picture_object_key?: string | null;
          picture_description?: string | null;
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
          mission_id: string | null;
          assignment_kind: Database["public"]["Enums"]["assignment_kind"];
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
          mission_id?: string | null;
          assignment_kind?: Database["public"]["Enums"]["assignment_kind"];
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
          teacher_confirmed_text: string | null;
          teacher_confirmed_by: string | null;
          teacher_confirmed_at: string | null;
          teacher_marked_no_speech: boolean;
          teacher_marked_no_speech_by: string | null;
          teacher_marked_no_speech_at: string | null;
          clarification_started_at: string | null;
          clarification_token: string | null;
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
          teacher_confirmed_text?: string | null;
          teacher_confirmed_by?: string | null;
          teacher_confirmed_at?: string | null;
          teacher_marked_no_speech?: boolean;
          teacher_marked_no_speech_by?: string | null;
          teacher_marked_no_speech_at?: string | null;
          clarification_started_at?: string | null;
          clarification_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audio_clips"]["Insert"]>;
        Relationships: [];
      };
      pronunciation_scores: {
        Row: {
          id: string;
          audio_clip_id: string;
          provider: string;
          reference_text: string;
          accuracy_score: number;
          fluency_score: number | null;
          completeness_score: number | null;
          pronunciation_score: number;
          star_band: number;
          word_scores: Json;
          scored_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          audio_clip_id: string;
          provider?: string;
          reference_text: string;
          accuracy_score: number;
          fluency_score?: number | null;
          completeness_score?: number | null;
          pronunciation_score: number;
          star_band: number;
          word_scores?: Json;
          scored_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pronunciation_scores"]["Insert"]>;
        Relationships: [];
      };
      pronunciation_word_tries: {
        Row: {
          id: string;
          attempt_turn_id: string;
          audio_clip_id: string;
          try_number: number;
          transcript: string;
          transcription_evidence: Json | null;
          outcome: "passed" | "target_weak" | "word_weak" | "different_word";
          word_accuracy: number | null;
          star_band: number | null;
          full_word_passed: boolean | null;
          target_sound_accuracy: number | null;
          target_sound_passed: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          attempt_turn_id: string;
          audio_clip_id: string;
          try_number: number;
          transcript: string;
          transcription_evidence?: Json | null;
          outcome: "passed" | "target_weak" | "word_weak" | "different_word";
          word_accuracy?: number | null;
          star_band?: number | null;
          full_word_passed?: boolean | null;
          target_sound_accuracy?: number | null;
          target_sound_passed?: boolean | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["pronunciation_word_tries"]["Insert"]
        >;
        Relationships: [];
      };
      pronunciation_samples: {
        Row: {
          id: string;
          student_id: string;
          object_key: string | null;
          mime_type: string | null;
          duration_ms: number;
          byte_size: number;
          status: Database["public"]["Enums"]["pronunciation_sample_status"];
          automatic_transcript: string | null;
          automatic_transcript_model: string | null;
          automatic_transcript_confidence: Json | null;
          provisional_result: Json | null;
          teacher_confirmed_text: string | null;
          confirmation_started_at: string | null;
          confirmation_token: string | null;
          deletion_started_at: string | null;
          deletion_token: string | null;
          deletion_kind: "teacher" | "expiry" | null;
          playback_lease_until: string | null;
          confirmed_by_teacher_id: string | null;
          confirmed_at: string | null;
          audio_expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          object_key?: string | null;
          mime_type?: string | null;
          duration_ms: number;
          byte_size: number;
          status?: Database["public"]["Enums"]["pronunciation_sample_status"];
          automatic_transcript?: string | null;
          automatic_transcript_model?: string | null;
          automatic_transcript_confidence?: Json | null;
          provisional_result?: Json | null;
          teacher_confirmed_text?: string | null;
          confirmation_started_at?: string | null;
          confirmation_token?: string | null;
          deletion_started_at?: string | null;
          deletion_token?: string | null;
          deletion_kind?: "teacher" | "expiry" | null;
          playback_lease_until?: string | null;
          confirmed_by_teacher_id?: string | null;
          confirmed_at?: string | null;
          audio_expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["pronunciation_samples"]["Insert"]
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
      tts_audio_generation_claims: {
        Row: {
          content_hash: string;
          owner_token: string;
          lease_expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          content_hash: string;
          owner_token: string;
          lease_expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["tts_audio_generation_claims"]["Insert"]
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
      student_unlock_target_attempts: {
        Row: {
          target_digest: string;
          window_started_at: string;
          attempt_count: number;
          updated_at: string;
        };
        Insert: {
          target_digest: string;
          window_started_at?: string;
          attempt_count?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["student_unlock_target_attempts"]["Insert"]
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
      owned_speaking_try_operation: {
        Args: {
          p_student_id: string;
          p_assignment_student_id: string;
          p_attempt_id: string;
          p_operation: string;
          p_payload?: Json;
        };
        Returns: Json;
      };
      assign_pronunciation_practice: {
        Args: {
          p_student_id: string;
          p_pronunciation_snapshot: Json;
          p_due_at?: string | null;
        };
        Returns: {
          out_assignment_id: string;
          out_assignment_student_id: string;
        }[];
      };
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
      start_student_attempt: {
        Args: {
          p_student_id: string;
          p_assignment_student_id: string;
        };
        Returns: {
          outcome: "ok" | "not_found" | "not_assigned_or_started";
          attempt_id: string | null;
          is_resume: boolean;
          required_turns: number | null;
        }[];
      };
      record_hint_reveal: {
        Args: {
          p_student_id: string;
          p_assignment_student_id: string;
          p_attempt_id: string;
          p_turn_order: number;
          p_hint_level: number;
        };
        Returns: "ok" | "not_found" | "invalid_hint_level" | "no_turn_row";
      };
      complete_student_attempt: {
        Args: {
          p_student_id: string;
          p_assignment_student_id: string;
          p_attempt_id: string;
        };
        Returns: "ok" | "not_found" | "not_complete";
      };
      start_pronunciation_attempt: {
        Args: {
          p_student_id: string;
          p_assignment_student_id: string;
        };
        Returns: {
          out_attempt_id: string;
          out_created: boolean;
        }[];
      };
      complete_pronunciation_attempt: {
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
      mark_submission_viewed: {
        Args: { p_teacher_id: string; p_attempt_id: string };
        Returns: "ok" | "not_found";
      };
      reopen_submission_review: {
        Args: { p_teacher_id: string; p_attempt_id: string };
        Returns: "ok" | "not_found";
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
      clear_student_unlock_attempts: {
        Args: { p_target_digest: string };
        Returns: undefined;
      };
      claim_tts_audio_generation: {
        Args: { p_content_hash: string; p_lease_seconds: number };
        Returns: {
          acquired: boolean;
          owner_token: string | null;
          lease_expires_at: string | null;
        }[];
      };
      finalize_tts_audio_generation: {
        Args: {
          p_content_hash: string;
          p_owner_token: string;
          p_object_key: string;
          p_mime_type: string;
          p_byte_size: number;
          p_provider: string;
          p_model: string;
          p_voice: string;
          p_response_format: string;
          p_character_id: string;
        };
        Returns: {
          finalized: boolean;
          object_key: string | null;
          mime_type: string | null;
        }[];
      };
      release_tts_audio_generation: {
        Args: { p_content_hash: string; p_owner_token: string };
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
      begin_teacher_mission_audio_clarification: {
        Args: {
          p_teacher_id: string;
          p_audio_clip_id: string;
          p_teacher_confirmed_text: string;
        };
        Returns: {
          outcome: "ok" | "unauthorized" | "invalid_input" | "unavailable";
          object_key: string | null;
          duration_ms: number | null;
          clarification_token: string | null;
        }[];
      };
      complete_teacher_mission_audio_clarification: {
        Args: {
          p_teacher_id: string;
          p_audio_clip_id: string;
          p_clarification_token: string;
          p_teacher_confirmed_text: string;
          p_accuracy_score: number;
          p_fluency_score: number | null;
          p_completeness_score: number | null;
          p_pronunciation_score: number;
          p_star_band: number;
          p_word_scores: Json;
        };
        Returns: "ok" | "not_found";
      };
      clear_teacher_mission_audio_clarification: {
        Args: {
          p_teacher_id: string;
          p_audio_clip_id: string;
          p_clarification_token: string;
        };
        Returns: "ok" | "not_found";
      };
      mark_teacher_mission_audio_no_speech: {
        Args: { p_teacher_id: string; p_audio_clip_id: string };
        Returns: "ok" | "unauthorized" | "unavailable";
      };
      begin_teacher_pronunciation_sample: {
        Args: {
          p_teacher_id: string;
          p_student_id: string;
          p_mime_type: string;
          p_duration_ms: number;
          p_byte_size: number;
        };
        Returns: {
          outcome: "ok" | "unauthorized" | "invalid_input";
          sample_id: string | null;
          object_key: string | null;
        }[];
      };
      complete_teacher_pronunciation_sample: {
        Args: {
          p_teacher_id: string;
          p_sample_id: string;
          p_automatic_transcript: string;
          p_transcription_model: string;
          p_transcription_confidence: Json;
          p_provisional_result: Json;
        };
        Returns: "ok" | "not_found";
      };
      clear_teacher_pronunciation_sample: {
        Args: { p_teacher_id: string; p_sample_id: string };
        Returns: "ok" | "not_found";
      };
      read_teacher_pronunciation_sample_confirmation: {
        Args: { p_teacher_id: string; p_sample_id: string };
        Returns: {
          outcome: "ok" | "unavailable" | "not_found";
          sample_id: string | null;
          student_id: string | null;
          object_key: string | null;
          mime_type: string | null;
          duration_ms: number | null;
          byte_size: number | null;
          automatic_transcript: string | null;
          provisional_result: Json | null;
          audio_expires_at: string | null;
          created_at: string | null;
        }[];
      };
      begin_teacher_pronunciation_sample_confirmation: {
        Args: { p_teacher_id: string; p_sample_id: string };
        Returns: {
          outcome: "ok" | "unavailable" | "not_found";
          sample_id: string | null;
          student_id: string | null;
          object_key: string | null;
          mime_type: string | null;
          duration_ms: number | null;
          byte_size: number | null;
          automatic_transcript: string | null;
          provisional_result: Json | null;
          audio_expires_at: string | null;
          created_at: string | null;
          confirmation_token: string | null;
        }[];
      };
      complete_teacher_pronunciation_sample_confirmation: {
        Args: {
          p_teacher_id: string;
          p_sample_id: string;
          p_confirmation_token: string;
          p_teacher_confirmed_text: string;
          p_confirmed_result: Json;
        };
        Returns: "ok" | "not_found";
      };
      clear_teacher_pronunciation_sample_confirmation: {
        Args: {
          p_teacher_id: string;
          p_sample_id: string;
          p_confirmation_token: string;
        };
        Returns: "ok" | "not_found";
      };
      begin_teacher_pronunciation_sample_deletion: {
        Args: { p_teacher_id: string; p_sample_id: string };
        Returns: {
          outcome: "ok" | "unavailable" | "not_found";
          sample_id: string | null;
          student_id: string | null;
          object_key: string | null;
          deletion_token: string | null;
        }[];
      };
      claim_expired_teacher_pronunciation_samples: {
        Args: { p_limit: number };
        Returns: {
          teacher_id: string;
          sample_id: string;
          object_key: string | null;
          deletion_token: string;
          deletion_kind: "teacher" | "expiry";
        }[];
      };
      finalize_teacher_pronunciation_sample_deletion: {
        Args: {
          p_teacher_id: string;
          p_sample_id: string;
          p_deletion_token: string;
        };
        Returns: "ok" | "not_found";
      };
      finalize_expired_teacher_pronunciation_sample_deletion: {
        Args: {
          p_teacher_id: string;
          p_sample_id: string;
          p_deletion_token: string;
        };
        Returns: "ok" | "not_found";
      };
      begin_teacher_pronunciation_sample_playback: {
        Args: { p_teacher_id: string; p_sample_id: string };
        Returns: {
          outcome: "ok" | "unavailable" | "not_found";
          object_key: string | null;
        }[];
      };
    };
    Enums: {
      data_mode: "demo" | "real";
      assignment_kind: "mission" | "pronunciation";
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
      pronunciation_sample_status: "processing" | "pending" | "confirmed";
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
