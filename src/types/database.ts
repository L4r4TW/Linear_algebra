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
      exercises: {
        Row: {
          created_at: string;
          difficulty: "easy" | "medium" | "hard";
          id: string;
          lesson_id: string;
          prompt: string;
          solution: string;
          source_ref: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          difficulty?: "easy" | "medium" | "hard";
          id?: string;
          lesson_id: string;
          prompt: string;
          solution: string;
          source_ref?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          difficulty?: "easy" | "medium" | "hard";
          id?: string;
          lesson_id?: string;
          prompt?: string;
          solution?: string;
          source_ref?: string | null;
          title?: string;
        };
      };
      lessons: {
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
    Enums: {
      exercise_difficulty: "easy" | "medium" | "hard";
    };
    CompositeTypes: Record<string, never>;
  };
};
