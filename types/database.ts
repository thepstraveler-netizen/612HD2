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
      vendors: Simple<
        {
          id: string;
          kind: Database["public"]["Enums"]["vendor_kind"];
          name: string;
          slug: string;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          gstin: string | null;
          commission_bps: number;
          status: Database["public"]["Enums"]["vendor_status"];
          deleted_at: string | null;
        } & Timestamps
      >;
      vendor_members: Simple<{
        vendor_id: string;
        user_id: string;
        role: "owner" | "staff";
        created_at: string;
      }>;
      hotels: Simple<
        {
          id: string;
          slug: string;
          vendor_id: string | null;
          city_id: string;
          area_id: string | null;
          name: LocalizedJson;
          summary: LocalizedJson | null;
          description: LocalizedJson;
          property_type: Database["public"]["Enums"]["hotel_property_type"];
          star_rating: number;
          address: string | null;
          lat: number | null;
          lng: number | null;
          check_in_time: string;
          check_out_time: string;
          highlights: LocalizedJson[];
          policies: Json;
          food_dining: LocalizedJson | null;
          is_couple_friendly: boolean;
          is_featured: boolean;
          is_sponsored: boolean;
          pay_at_hotel_enabled: boolean;
          part_payment_percent: number | null;
          early_checkin_paise: number | null;
          late_checkout_paise: number | null;
          breakfast_addon_paise: number | null;
          commission_bps: number | null;
          rating_avg: number | null;
          rating_count: number;
          status: Database["public"]["Enums"]["publish_status"];
          seo: Json;
          sort_order: number;
          deleted_at: string | null;
        } & Timestamps
      >;
      hotel_rooms: Simple<
        {
          id: string;
          hotel_id: string;
          name: LocalizedJson;
          description: LocalizedJson | null;
          bed_type: string | null;
          size_sqft: number | null;
          base_occupancy: number;
          max_adults: number;
          max_children: number;
          max_occupancy: number;
          total_units: number;
          amenity_ids: string[];
          sort_order: number;
          is_active: boolean;
        } & Timestamps
      >;
      hotel_rate_plans: Simple<
        {
          id: string;
          room_id: string;
          name: LocalizedJson;
          meal_plan: Database["public"]["Enums"]["meal_plan"];
          inclusions: LocalizedJson[];
          is_refundable: boolean;
          cancellation_rules: { hours_before: number; refund_percent: number }[];
          base_price_paise: number;
          extra_adult_paise: number;
          extra_child_paise: number;
          currency: "INR";
          min_stay: number;
          max_stay: number | null;
          sort_order: number;
          is_active: boolean;
        } & Timestamps
      >;
      hotel_inventory: Simple<{
        room_id: string;
        date: string;
        units: number | null;
        sold_units: number;
        is_closed: boolean;
        min_stay: number | null;
        updated_at: string;
      }>;
      hotel_rates: Simple<{ rate_plan_id: string; date: string; price_paise: number; updated_at: string }>;
      hotel_pricing_rules: Simple<
        {
          id: string;
          hotel_id: string;
          room_id: string | null;
          rate_plan_id: string | null;
          name: string;
          start_date: string;
          end_date: string;
          weekdays: number[];
          adjustment: Database["public"]["Enums"]["price_adjustment"];
          value: number;
          priority: number;
          is_active: boolean;
        } & Timestamps
      >;
      hotel_media: Simple<
        {
          hotel_id: string;
          media_id: string;
          room_id: string | null;
          sort_order: number;
          created_at: string;
        },
        [MediaFk<"hotel_media_media_id_fkey", "media_id">]
      >;
      hotel_amenities: Simple<{ hotel_id: string; amenity_id: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      has_role: { Args: { role_key: string }; Returns: boolean };
      has_permission: { Args: { permission_key: string }; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_user_roles: { Args: Record<PropertyKey, never>; Returns: string[] };
      current_user_permissions: { Args: Record<PropertyKey, never>; Returns: string[] };
      grant_role_by_email: { Args: { p_email: string; p_role: string }; Returns: string };
      is_vendor_member: { Args: { p_vendor_id: string }; Returns: boolean };
      can_read_hotel: { Args: { p_hotel_id: string }; Returns: boolean };
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
        | "faqs"
        | "featured_hotels";
      offer_tab: "all" | "hotels" | "cabs" | "food" | "packages";
      publish_status: "draft" | "published" | "archived";
      vendor_kind: "hotel" | "restaurant" | "store" | "transport" | "pharmacy" | "agency" | "other";
      vendor_status: "pending" | "active" | "suspended";
      hotel_property_type:
        "hotel" | "guest_house" | "dharamshala" | "ashram" | "homestay" | "resort" | "apartment" | "hostel";
      meal_plan: "room_only" | "breakfast" | "half_board" | "full_board";
      price_adjustment: "percent" | "flat" | "fixed";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
