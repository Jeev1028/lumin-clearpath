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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      messages: {
        Row: {
          client_message_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          client_message_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          client_message_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_events: {
        Row: {
          category: Database["public"]["Enums"]["schedule_category"]
          created_at: string
          day_of_week: number
          end_time: string
          google_event_id: string | null
          id: string
          location: string | null
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["schedule_category"]
          created_at?: string
          day_of_week?: number
          end_time?: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          start_time?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["schedule_category"]
          created_at?: string
          day_of_week?: number
          end_time?: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          can_manage_groups: boolean
          can_manage_notices: boolean
          can_send_email: boolean
          can_view_grades: boolean
          can_view_users: boolean
          email: string
          granted_at: string
          granted_by: string | null
          is_root: boolean
          user_id: string
        }
        Insert: {
          can_manage_groups?: boolean
          can_manage_notices?: boolean
          can_send_email?: boolean
          can_view_grades?: boolean
          can_view_users?: boolean
          email: string
          granted_at?: string
          granted_by?: string | null
          is_root?: boolean
          user_id: string
        }
        Update: {
          can_manage_groups?: boolean
          can_manage_notices?: boolean
          can_send_email?: boolean
          can_view_grades?: boolean
          can_view_users?: boolean
          email?: string
          granted_at?: string
          granted_by?: string | null
          is_root?: boolean
          user_id?: string
        }
        Relationships: []
      }
      admin_email_log: {
        Row: {
          id: string
          recipient_count: number
          sent_at: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          id?: string
          recipient_count: number
          sent_at?: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          id?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          group_ids: string[] | null
          id: string
          message: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          group_ids?: string[] | null
          id?: string
          message: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          group_ids?: string[] | null
          id?: string
          message?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          added_at: string
          group_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          description: string | null
          end_at: string
          google_event_id: string | null
          id: string
          location: string | null
          source: string
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          description?: string | null
          end_at: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          source?: string
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          description?: string | null
          end_at?: string
          google_event_id?: string | null
          id?: string
          location?: string | null
          source?: string
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_connections: {
        Row: {
          access_token_encrypted: string | null
          access_token_expires_at: string | null
          connected_at: string
          google_calendar_id: string
          id: string
          last_synced_at: string | null
          refresh_token_encrypted: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          google_calendar_id?: string
          id?: string
          last_synced_at?: string | null
          refresh_token_encrypted: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          google_calendar_id?: string
          id?: string
          last_synced_at?: string | null
          refresh_token_encrypted?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_digest_log: {
        Row: {
          sent_at: string
          sent_for_date: string
          user_id: string
        }
        Insert: {
          sent_at?: string
          sent_for_date: string
          user_id: string
        }
        Update: {
          sent_at?: string
          sent_for_date?: string
          user_id?: string
        }
        Relationships: []
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      study_plans: {
        Row: {
          completed_blocks: string[]
          generated_at: string
          horizon: string
          plan_markdown: string
          preferences: string | null
          user_id: string
        }
        Insert: {
          completed_blocks?: string[]
          generated_at?: string
          horizon?: string
          plan_markdown: string
          preferences?: string | null
          user_id: string
        }
        Update: {
          completed_blocks?: string[]
          generated_at?: string
          horizon?: string
          plan_markdown?: string
          preferences?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          alternate_link: string | null
          assigned_grade: number | null
          classroom_course_id: string | null
          course: string | null
          created_at: string
          description: string | null
          due_date: string | null
          google_classroom_id: string | null
          id: string
          kind: Database["public"]["Enums"]["task_kind"]
          materials: Json
          max_points: number | null
          notes: string | null
          rubric: Json | null
          source: string
          status: Database["public"]["Enums"]["task_status"]
          student_work: Json
          submission_state: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alternate_link?: string | null
          assigned_grade?: number | null
          classroom_course_id?: string | null
          course?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          google_classroom_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          materials?: Json
          max_points?: number | null
          notes?: string | null
          rubric?: Json | null
          source?: string
          status?: Database["public"]["Enums"]["task_status"]
          student_work?: Json
          submission_state?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alternate_link?: string | null
          assigned_grade?: number | null
          classroom_course_id?: string | null
          course?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          google_classroom_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          materials?: Json
          max_points?: number | null
          notes?: string | null
          rubric?: Json | null
          source?: string
          status?: Database["public"]["Enums"]["task_status"]
          student_work?: Json
          submission_state?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_classroom_connections: {
        Row: {
          access_token_encrypted: string | null
          access_token_expires_at: string | null
          connected_at: string
          last_synced_at: string | null
          refresh_token_encrypted: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          last_synced_at?: string | null
          refresh_token_encrypted: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          last_synced_at?: string | null
          refresh_token_encrypted?: string
          user_id?: string
        }
        Relationships: []
      }
      classroom_courses: {
        Row: {
          id: string
          name: string
          room: string | null
          section: string | null
          teacher_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          id: string
          name: string
          room?: string | null
          section?: string | null
          teacher_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          room?: string | null
          section?: string | null
          teacher_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      classroom_coursework: {
        Row: {
          alternate_link: string | null
          assigned_grade: number | null
          course_id: string
          description: string | null
          due_at: string | null
          id: string
          materials: Json
          max_points: number | null
          rubric: Json | null
          student_work: Json
          submission_state: string | null
          title: string
          updated_at: string
          user_id: string
          work_type: string | null
        }
        Insert: {
          alternate_link?: string | null
          assigned_grade?: number | null
          course_id: string
          description?: string | null
          due_at?: string | null
          id: string
          materials?: Json
          max_points?: number | null
          rubric?: Json | null
          student_work?: Json
          submission_state?: string | null
          title: string
          updated_at?: string
          user_id: string
          work_type?: string | null
        }
        Update: {
          alternate_link?: string | null
          assigned_grade?: number | null
          course_id?: string
          description?: string | null
          due_at?: string | null
          id?: string
          materials?: Json
          max_points?: number | null
          rubric?: Json | null
          student_work?: Json
          submission_state?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          work_type?: string | null
        }
        Relationships: []
      }
      flashcard_decks: {
        Row: {
          course: string | null
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course?: string | null
          created_at?: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course?: string | null
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          back: string
          box: number
          created_at: string
          deck_id: string
          due_at: string
          front: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back: string
          box?: number
          created_at?: string
          deck_id: string
          due_at?: string
          front: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string
          box?: number
          created_at?: string
          deck_id?: string
          due_at?: string
          front?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          title: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      teacher_comments: {
        Row: {
          course_id: string
          coursework_id: string | null
          created_at: string
          id: string
          message: string
          read_at: string | null
          teacher_email: string
          user_id: string
        }
        Insert: {
          course_id: string
          coursework_id?: string | null
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          teacher_email: string
          user_id: string
        }
        Update: {
          course_id?: string
          coursework_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          teacher_email?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_messages: {
        Row: {
          course_id: string
          coursework_id: string | null
          id: string
          message: string
          sent_at: string
          teacher_email: string
          user_id: string
        }
        Insert: {
          course_id: string
          coursework_id?: string | null
          id?: string
          message: string
          sent_at?: string
          teacher_email: string
          user_id: string
        }
        Update: {
          course_id?: string
          coursework_id?: string | null
          id?: string
          message?: string
          sent_at?: string
          teacher_email?: string
          user_id?: string
        }
        Relationships: []
      }
      classroom_announcements: {
        Row: {
          course_id: string
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      classroom_materials: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          items: Json
          title: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at: string
          description?: string | null
          id: string
          items?: Json
          title: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          items?: Json
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      schedule_category: "weekday" | "weekend" | "extracurricular" | "holiday"
      task_kind: "test" | "assignment" | "project" | "reading"
      task_status: "todo" | "in_progress" | "submitted"
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
      schedule_category: ["weekday", "weekend", "extracurricular", "holiday"],
      task_kind: ["test", "assignment", "project", "reading"],
      task_status: ["todo", "in_progress", "submitted"],
    },
  },
} as const
