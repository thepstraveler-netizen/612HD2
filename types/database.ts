/**
 * Database types for the Phase 1 schema.
 *
 * Hand-written to match supabase/migrations until a Supabase project exists;
 * regenerate with `pnpm db:types` (supabase gen types) once it does, and the
 * generated file replaces this one with the same shape.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          is_staff: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          is_staff?: boolean;
        } & Partial<Timestamps>;
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
        Relationships: [];
      };
      permissions: {
        Row: { id: string; key: string; module: string; description: string | null } & Timestamps;
        Insert: {
          id?: string;
          key: string;
          module: string;
          description?: string | null;
        } & Partial<Timestamps>;
        Update: Partial<Database["public"]["Tables"]["permissions"]["Insert"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string; created_at: string };
        Insert: { role_id: string; permission_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: { user_id: string; role_id: string; granted_by: string | null; created_at: string };
        Insert: { user_id: string; role_id: string; granted_by?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          preferred_locale: "en" | "hi";
          is_blocked: boolean;
          deleted_at: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          preferred_locale?: "en" | "hi";
          is_blocked?: boolean;
          deleted_at?: string | null;
        } & Partial<Timestamps>;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          occurred_at: string;
          actor_id: string | null;
          actor_role: string | null;
          action: "INSERT" | "UPDATE" | "DELETE";
          table_name: string;
          record_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          changed_fields: string[] | null;
          ip: string | null;
          user_agent: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      has_role: { Args: { role_key: string }; Returns: boolean };
      has_permission: { Args: { permission_key: string }; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_user_roles: { Args: Record<PropertyKey, never>; Returns: string[] };
      current_user_permissions: { Args: Record<PropertyKey, never>; Returns: string[] };
      grant_role_by_email: { Args: { p_email: string; p_role: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
