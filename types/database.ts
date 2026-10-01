/**
 * Database types for the Phase 1 schema.
 *
 * Hand-written to match supabase/migrations until a Supabase project exists;
 * regenerate with `pnpm db:types` (supabase gen types) once it does, and the
 * generated file replaces this one with the same shape.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

/** Admin-editable text: `{ en: "...", hi?: "..." }` (see public.is_localized). */
export type LocalizedJson = { en: string; hi?: string | null };

/**
 * Table shape for tables whose insert type is "row with defaults optional".
 * Columns with DB defaults are optional on insert.
 */
type Simple<Row, Rel extends unknown[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Rel;
};

type MediaFk<Name extends string, Column extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: "media";
  referencedColumns: ["id"];
};

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
      cities: Simple<
        {
          id: string;
          slug: string;
          name: LocalizedJson;
          state: string;
          lat: number | null;
          lng: number | null;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      areas: Simple<
        {
          id: string;
          city_id: string;
          slug: string;
          name: LocalizedJson;
          kind: "area" | "landmark" | "station" | "airport" | "temple";
          lat: number | null;
          lng: number | null;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      media: Simple<
        {
          id: string;
          bucket: "media";
          path: string;
          alt: LocalizedJson;
          mime_type: string;
          size_bytes: number;
          width: number | null;
          height: number | null;
          collection: string;
          created_by: string | null;
          deleted_at: string | null;
        } & Timestamps
      >;
      services: Simple<
        {
          id: string;
          slug: string;
          kind: Database["public"]["Enums"]["service_kind"];
          accent: Database["public"]["Enums"]["service_accent"];
          icon: string;
          name: LocalizedJson;
          summary: LocalizedJson;
          description: LocalizedJson;
          highlights: LocalizedJson[];
          cta_label: LocalizedJson | null;
          hero_media_id: string | null;
          config: Json;
          seo: Json;
          sort_order: number;
          is_published: boolean;
          show_in_nav: boolean;
          deleted_at: string | null;
        } & Timestamps,
        [MediaFk<"services_hero_media_id_fkey", "hero_media_id">]
      >;
      categories: Simple<
        {
          id: string;
          service_id: string | null;
          parent_id: string | null;
          slug: string;
          name: LocalizedJson;
          icon: string | null;
          sort_order: number;
          is_active: boolean;
        } & Timestamps
      >;
      amenities: Simple<
        {
          id: string;
          slug: string;
          name: LocalizedJson;
          icon: string | null;
          grouping: string;
          sort_order: number;
          is_active: boolean;
        } & Timestamps
      >;
      tags: Simple<{ id: string; slug: string; name: LocalizedJson; color: string | null } & Timestamps>;
      cms_sections: Simple<
        {
          id: string;
          page: string;
          key: string;
          type: Database["public"]["Enums"]["cms_section_type"];
          title: LocalizedJson | null;
          subtitle: LocalizedJson | null;
          content: Json;
          sort_order: number;
          is_visible: boolean;
        } & Timestamps
      >;
      offers_banners: Simple<
        {
          id: string;
          tab: Database["public"]["Enums"]["offer_tab"];
          title: LocalizedJson;
          subtitle: LocalizedJson | null;
          coupon_code: string | null;
          cta_label: LocalizedJson | null;
          href: string | null;
          media_id: string | null;
          accent: Database["public"]["Enums"]["service_accent"];
          starts_at: string | null;
          ends_at: string | null;
          sort_order: number;
          is_active: boolean;
        } & Timestamps,
        [MediaFk<"offers_banners_media_id_fkey", "media_id">]
      >;
      testimonials: Simple<
        {
          id: string;
          author_name: string;
          author_place: string | null;
          quote: LocalizedJson;
          rating: number;
          service_id: string | null;
          media_id: string | null;
          sort_order: number;
          is_published: boolean;
        } & Timestamps
      >;
      faqs: Simple<
        {
          id: string;
          service_id: string | null;
          question: LocalizedJson;
          answer: LocalizedJson;
          sort_order: number;
          is_published: boolean;
        } & Timestamps
      >;
      navigation_links: Simple<
        {
          id: string;
          menu: "header" | "footer_company" | "footer_legal";
          label: LocalizedJson;
          href: string;
          sort_order: number;
          is_visible: boolean;
        } & Timestamps
      >;
      cms_pages: Simple<
        {
          id: string;
          slug: string;
          title: LocalizedJson;
          body: LocalizedJson;
          seo: Json;
          status: Database["public"]["Enums"]["publish_status"];
          published_at: string | null;
        } & Timestamps
      >;
      settings: Simple<
        { key: string; value: Json; is_public: boolean; description: string | null } & Timestamps
      >;
      feature_flags: Simple<{ key: string; enabled: boolean; description: string | null } & Timestamps>;
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
    Enums: {
      service_kind: "bookable" | "enquiry";
      service_accent:
        "blue" | "teal" | "purple" | "pink" | "green" | "amber" | "red" | "orange" | "magenta" | "indigo";
      cms_section_type:
        | "hero"
        | "pillars"
        | "about"
        | "services"
        | "offers"
        | "testimonials"
        | "why_collaborate"
        | "partner_cta"
        | "faqs";
      offer_tab: "all" | "hotels" | "cabs" | "food" | "packages";
      publish_status: "draft" | "published" | "archived";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
