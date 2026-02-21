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
      attempts: {
        Row: {
          answer: Json;
          created_at: string;
          exercise_id: string;
          id: string;
          is_correct: boolean;
          user_id: string;
        };
        Insert: {
          answer: Json;
          created_at?: string;
          exercise_id: string;
          id?: string;
          is_correct: boolean;
          user_id: string;
        };
        Update: {
          answer?: Json;
          created_at?: string;
          exercise_id?: string;
          id?: string;
          is_correct?: boolean;
          user_id?: string;
        };
      };
      exercises: {
        Row: {
          choices: Json;
          created_at: string;
          created_by: string | null;
          difficulty: number;
          hints: Json;
          id: string;
          prompt: Json;
          prompt_md: string;
          solution: Json;
          solution_md: string;
          status: "draft" | "published";
          subtheme_id: string;
          tags: Json;
          title: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          choices?: Json;
          created_at?: string;
          created_by?: string | null;
          difficulty: number;
          hints?: Json;
          id?: string;
          prompt: Json;
          prompt_md?: string;
          solution: Json;
          solution_md?: string;
          status?: "draft" | "published";
          subtheme_id: string;
          tags?: Json;
          title?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          choices?: Json;
          created_at?: string;
          created_by?: string | null;
          difficulty?: number;
          hints?: Json;
          id?: string;
          prompt?: Json;
          prompt_md?: string;
          solution?: Json;
          solution_md?: string;
          status?: "draft" | "published";
          subtheme_id?: string;
          tags?: Json;
          title?: string;
          type?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          role: "student" | "admin";
          username: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          role?: "student" | "admin";
          username: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: "student" | "admin";
          username?: string;
        };
      };
      subthemes: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          slug: string;
          theme_id: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position: number;
          slug: string;
          theme_id: string;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          slug?: string;
          theme_id?: string;
          title?: string;
        };
      };
      themes: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          slug: string;
          title: string;
          unit_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position: number;
          slug: string;
          title: string;
          unit_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          slug?: string;
          title?: string;
          unit_id?: string;
        };
      };
      units: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          slug: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position: number;
          slug: string;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          slug?: string;
          title?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
