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
          created_at: string;
          difficulty: number;
          id: string;
          prompt: Json;
          solution: Json;
          topic_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          difficulty: number;
          id?: string;
          prompt: Json;
          solution: Json;
          topic_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          difficulty?: number;
          id?: string;
          prompt?: Json;
          solution?: Json;
          topic_id?: string;
          type?: string;
        };
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          username: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          username?: string;
        };
      };
      topics: {
        Row: {
          created_at: string;
          id: string;
          slug: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          slug: string;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
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
