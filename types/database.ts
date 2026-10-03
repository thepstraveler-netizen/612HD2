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
          referral_code: string | null;
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
          referral_code?: string | null;
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
          pan: string | null;
          address: string | null;
          city: string | null;
          bank_details: Json | null;
          agreement_version: string | null;
          agreement_accepted_at: string | null;
          notes: string | null;
          application_id: string | null;
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
        held_units: number;
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
      coupons: Simple<
        {
          id: string;
          code: string;
          description: LocalizedJson | null;
          discount_type: Database["public"]["Enums"]["coupon_discount"];
          value: number;
          max_discount_paise: number | null;
          min_order_paise: number;
          services: Database["public"]["Enums"]["booking_service"][];
          hotel_ids: string[];
          starts_at: string | null;
          ends_at: string | null;
          usage_limit: number | null;
          per_user_limit: number;
          first_booking_only: boolean;
          is_public: boolean;
          is_active: boolean;
          /** Personal coupon (P&S Rewards code); null = anyone. */
          user_id: string | null;
        } & Timestamps
      >;
      bookings: Simple<
        {
          id: string;
          code: string;
          user_id: string | null;
          service: Database["public"]["Enums"]["booking_service"];
          status: Database["public"]["Enums"]["booking_status"];
          hotel_id: string | null;
          vendor_id: string | null;
          check_in: string | null;
          check_out: string | null;
          rooms: number | null;
          adults: number | null;
          children: number;
          contact_name: string;
          contact_email: string | null;
          contact_phone: string;
          special_requests: string | null;
          gst_details: Json | null;
          subtotal_paise: number;
          discount_paise: number;
          tax_paise: number;
          total_paise: number;
          payable_now_paise: number;
          paid_paise: number;
          refunded_paise: number;
          payment_mode: Database["public"]["Enums"]["payment_mode"];
          coupon_id: string | null;
          coupon_code: string | null;
          price_breakdown: Json;
          snapshot: Json;
          locale: "en" | "hi";
          expires_at: string | null;
          confirmed_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
        } & Timestamps
      >;
      booking_items: Simple<{
        id: string;
        booking_id: string;
        kind: "room" | "extra_guest" | "addon" | "fee" | "fare" | "allowance" | "surcharge";
        line_key: string;
        description: string;
        service_date: string | null;
        room_id: string | null;
        rate_plan_id: string | null;
        quantity: number;
        amount_paise: number;
        discount_paise: number;
        tax_rate_bps: number;
        tax_paise: number;
        sac: string | null;
        sort_order: number;
      }>;
      booking_guests: Simple<{
        id: string;
        booking_id: string;
        full_name: string;
        is_child: boolean;
        is_primary: boolean;
        sort_order: number;
      }>;
      inventory_locks: Simple<
        {
          id: string;
          booking_id: string;
          room_id: string;
          date: string;
          units: number;
          status: Database["public"]["Enums"]["lock_status"];
          expires_at: string;
        } & Timestamps
      >;
      coupon_redemptions: Simple<
        {
          id: string;
          coupon_id: string;
          booking_id: string;
          user_id: string | null;
          discount_paise: number;
          status: "reserved" | "redeemed" | "released";
        } & Timestamps
      >;
      payments: Simple<
        {
          id: string;
          booking_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_order_id: string | null;
          provider_payment_id: string | null;
          payment_link_id: string | null;
          payment_link_url: string | null;
          amount_paise: number;
          status: Database["public"]["Enums"]["payment_status"];
          method: string | null;
          reference: string | null;
          error_code: string | null;
          error_description: string | null;
          raw: Json | null;
          recorded_by: string | null;
          captured_at: string | null;
        } & Timestamps
      >;
      payment_events: Simple<{
        id: string;
        provider: Database["public"]["Enums"]["payment_provider"];
        event_id: string;
        event_type: string;
        payload: Json;
        booking_id: string | null;
        processed_at: string | null;
        result: string | null;
        error: string | null;
        received_at: string;
      }>;
      refunds: Simple<
        {
          id: string;
          booking_id: string;
          payment_id: string;
          provider_refund_id: string | null;
          amount_paise: number;
          status: Database["public"]["Enums"]["refund_status"];
          reason: string | null;
          initiated_by: string | null;
          raw: Json | null;
          processed_at: string | null;
        } & Timestamps
      >;
      invoices: Simple<{
        id: string;
        booking_id: string;
        number: string;
        financial_year: string;
        issued_at: string;
        seller: Json;
        buyer: Json;
        created_at: string;
      }>;
      notification_templates: Simple<
        {
          id: string;
          key: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          locale: "en" | "hi";
          subject: string | null;
          body: string;
          is_active: boolean;
        } & Timestamps
      >;
      notification_logs: Simple<{
        id: string;
        template_key: string;
        channel: Database["public"]["Enums"]["notification_channel"];
        recipient: string | null;
        booking_id: string | null;
        user_id: string | null;
        status: Database["public"]["Enums"]["notification_status"];
        provider: string | null;
        provider_message_id: string | null;
        error: string | null;
        created_at: string;
      }>;
      cab_places: Simple<
        {
          id: string;
          slug: string;
          name: LocalizedJson;
          kind: Database["public"]["Enums"]["cab_place_kind"];
          lat: number;
          lng: number;
          is_popular: boolean;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      cab_categories: Simple<
        {
          id: string;
          key: string;
          name: LocalizedJson;
          description: LocalizedJson | null;
          body_type: Database["public"]["Enums"]["cab_body_type"];
          seats: number;
          luggage: number;
          is_ac: boolean;
          image_id: string | null;
          is_active: boolean;
          sort_order: number;
        } & Timestamps,
        [MediaFk<"cab_categories_image_id_fkey", "image_id">]
      >;
      cab_models: Simple<
        {
          id: string;
          category_id: string;
          name: string;
          fuel: Database["public"]["Enums"]["fuel_type"];
          is_featured: boolean;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      cab_fare_rules: Simple<
        {
          id: string;
          category_id: string;
          trip_type: "one_way" | "round_trip";
          rate_per_km_paise: number;
          min_km: number;
          min_km_per_day: number;
          driver_allowance_per_day_paise: number;
          night_charge_paise: number;
          extra_km_paise: number;
          tolls_included: boolean;
          waiting_free_minutes: number;
          waiting_per_hour_paise: number;
          is_active: boolean;
        } & Timestamps
      >;
      cab_routes: Simple<
        {
          id: string;
          slug: string;
          trip_type: Exclude<Database["public"]["Enums"]["cab_trip_type"], "local">;
          from_place_id: string;
          to_place_id: string;
          name: LocalizedJson | null;
          description: LocalizedJson | null;
          stops: Json;
          distance_km: number;
          duration_minutes: number;
          is_popular: boolean;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      cab_route_fares: Simple<
        {
          route_id: string;
          category_id: string;
          fare_paise: number;
          extra_km_paise: number | null;
          tolls_included: boolean;
        } & Timestamps
      >;
      cab_local_packages: Simple<
        {
          id: string;
          key: string;
          name: LocalizedJson;
          hours: number;
          km: number;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      cab_local_fares: Simple<
        {
          package_id: string;
          category_id: string;
          fare_paise: number;
          extra_km_paise: number;
          extra_hour_paise: number;
        } & Timestamps
      >;
      cab_addons: Simple<
        {
          id: string;
          key: string;
          name: LocalizedJson;
          description: LocalizedJson | null;
          price_paise: number;
          trip_types: Database["public"]["Enums"]["cab_trip_type"][];
          category_ids: string[];
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      cab_surcharges: Simple<
        {
          id: string;
          name: LocalizedJson;
          multiplier_bps: number;
          starts_on: string | null;
          ends_on: string | null;
          weekdays: number[];
          trip_types: Database["public"]["Enums"]["cab_trip_type"][];
          category_ids: string[];
          is_active: boolean;
        } & Timestamps
      >;
      drivers: Simple<
        {
          id: string;
          user_id: string | null;
          vendor_id: string | null;
          full_name: string;
          phone: string;
          alt_phone: string | null;
          licence_no: string | null;
          licence_expiry: string | null;
          photo_id: string | null;
          languages: string[];
          rating: number | null;
          is_active: boolean;
          notes: string | null;
          deleted_at: string | null;
        } & Timestamps
      >;
      vehicles: Simple<
        {
          id: string;
          /** Exactly one of category_id (cab) and ride_vehicle_type_id (local ride) is set. */
          category_id: string | null;
          ride_vehicle_type_id: string | null;
          model_id: string | null;
          /** Required for cabs; a cycle rickshaw may have none. */
          registration_no: string | null;
          colour: string | null;
          year: number | null;
          fuel: Database["public"]["Enums"]["fuel_type"];
          vendor_id: string | null;
          default_driver_id: string | null;
          rc_expiry: string | null;
          insurance_expiry: string | null;
          permit_expiry: string | null;
          puc_expiry: string | null;
          fitness_expiry: string | null;
          is_active: boolean;
          notes: string | null;
          deleted_at: string | null;
        } & Timestamps
      >;
      fleet_documents: Simple<{
        id: string;
        owner_type: "driver" | "vehicle";
        owner_id: string;
        kind: "licence" | "rc" | "insurance" | "permit" | "puc" | "fitness" | "id_proof" | "other";
        file_path: string;
        expires_on: string | null;
        uploaded_by: string | null;
        created_at: string;
      }>;
      trips: Simple<
        {
          id: string;
          booking_id: string;
          trip_type: Database["public"]["Enums"]["cab_trip_type"];
          category_id: string;
          route_id: string | null;
          package_id: string | null;
          pickup_place_id: string;
          drop_place_id: string | null;
          pickup_address: string;
          drop_address: string | null;
          stops: Json;
          pickup_at: string;
          return_at: string | null;
          passengers: number;
          distance_km: number | null;
          status: Database["public"]["Enums"]["trip_status"];
          driver_id: string | null;
          vehicle_id: string | null;
          driver_name: string | null;
          driver_phone: string | null;
          vehicle_label: string | null;
          vehicle_registration: string | null;
          assigned_at: string | null;
          started_at: string | null;
          picked_up_at: string | null;
          completed_at: string | null;
          pickup_otp: string | null;
          /** Service role only (column grant excludes it). */
          driver_token: string | null;
          driver_token_expires_at: string | null;
        } & Timestamps
      >;
      trip_events: Simple<{
        id: string;
        trip_id: string;
        status: Database["public"]["Enums"]["trip_status"];
        note: string | null;
        actor: string | null;
        source: "admin" | "driver" | "system" | "customer";
        created_at: string;
      }>;
      ride_vehicle_types: Simple<
        {
          id: string;
          key: string;
          service_slug: string;
          name: LocalizedJson;
          description: LocalizedJson | null;
          icon: string;
          seats: number;
          instant_book: boolean;
          tax_bps: number;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      ride_zones: Simple<
        {
          id: string;
          slug: string;
          name: LocalizedJson;
          lat: number;
          lng: number;
          radius_km: number;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      ride_points: Simple<
        {
          id: string;
          zone_id: string;
          slug: string;
          name: LocalizedJson;
          kind: "temple" | "ghat" | "station" | "market" | "hotel" | "landmark";
          lat: number;
          lng: number;
          is_popular: boolean;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      ride_fare_rules: Simple<
        {
          id: string;
          zone_id: string;
          vehicle_type_id: string;
          mode: Database["public"]["Enums"]["ride_mode"];
          base_paise: number;
          included_km: number;
          per_km_paise: number;
          min_fare_paise: number;
          hourly_rate_paise: number;
          min_hours: number;
          km_per_hour: number;
          free_waiting_minutes: number;
          per_min_waiting_paise: number;
          night_bps: number;
          is_active: boolean;
        } & Timestamps
      >;
      ride_requests: Simple<
        {
          id: string;
          booking_id: string;
          vehicle_type_id: string;
          zone_id: string;
          mode: Database["public"]["Enums"]["ride_mode"];
          pickup_point_id: string | null;
          pickup_lat: number;
          pickup_lng: number;
          pickup_address: string;
          drop_point_id: string | null;
          drop_lat: number | null;
          drop_lng: number | null;
          drop_address: string | null;
          hours: number | null;
          pickup_at: string;
          passengers: number;
          distance_km: number | null;
          status: Database["public"]["Enums"]["ride_status"];
          driver_id: string | null;
          vehicle_id: string | null;
          driver_name: string | null;
          driver_phone: string | null;
          vehicle_label: string | null;
          vehicle_registration: string | null;
          assigned_at: string | null;
          started_at: string | null;
          picked_up_at: string | null;
          completed_at: string | null;
          pickup_otp: string | null;
          /** Service role only (column grant excludes it). */
          driver_token: string | null;
          driver_token_expires_at: string | null;
          rating: number | null;
          rating_comment: string | null;
          rated_at: string | null;
        } & Timestamps
      >;
      ride_events: Simple<{
        id: string;
        ride_id: string;
        status: Database["public"]["Enums"]["ride_status"];
        note: string | null;
        actor: string | null;
        source: "admin" | "driver" | "system" | "customer";
        created_at: string;
      }>;
      delivery_zones: Simple<
        {
          id: string;
          slug: string;
          name: LocalizedJson;
          fee_paise: number;
          free_above_paise: number | null;
          eta_minutes: number;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      stores: Simple<
        {
          id: string;
          vendor_id: string;
          kind: Database["public"]["Enums"]["store_kind"];
          slug: string;
          name: LocalizedJson;
          description: LocalizedJson | null;
          cuisines: string[];
          image_id: string | null;
          address: string | null;
          phone: string | null;
          lat: number | null;
          lng: number | null;
          pure_veg: boolean;
          is_24x7: boolean;
          hours: Json;
          accepting_orders: boolean;
          prep_minutes: number;
          min_order_paise: number;
          packaging_fee_paise: number;
          tax_bps: number;
          drug_licence_no: string | null;
          rating: number | null;
          rating_count: number;
          is_featured: boolean;
          is_active: boolean;
          sort_order: number;
          deleted_at: string | null;
        } & Timestamps,
        [MediaFk<"stores_image_id_fkey", "image_id">]
      >;
      store_zones: Simple<{ store_id: string; zone_id: string }>;
      store_categories: Simple<
        {
          id: string;
          store_id: string;
          name: LocalizedJson;
          is_active: boolean;
          sort_order: number;
        } & Timestamps
      >;
      store_items: Simple<
        {
          id: string;
          store_id: string;
          category_id: string | null;
          name: LocalizedJson;
          description: LocalizedJson | null;
          image_id: string | null;
          diet: "veg" | "egg" | "non_veg" | "na";
          is_jain: boolean;
          is_sattvik: boolean;
          price_paise: number;
          mrp_paise: number | null;
          tax_bps: number | null;
          hsn: string | null;
          unit: string | null;
          track_stock: boolean;
          stock: number | null;
          is_available: boolean;
          is_bestseller: boolean;
          sort_order: number;
        } & Timestamps,
        [MediaFk<"store_items_image_id_fkey", "image_id">]
      >;
      item_variants: Simple<
        {
          id: string;
          item_id: string;
          name: LocalizedJson;
          price_paise: number;
          stock: number | null;
          is_available: boolean;
          sort_order: number;
        } & Timestamps
      >;
      item_addon_groups: Simple<
        {
          id: string;
          item_id: string;
          name: LocalizedJson;
          min_select: number;
          max_select: number;
          sort_order: number;
        } & Timestamps
      >;
      item_addons: Simple<
        {
          id: string;
          group_id: string;
          name: LocalizedJson;
          price_paise: number;
          is_available: boolean;
          sort_order: number;
        } & Timestamps
      >;
      addresses: Simple<
        {
          id: string;
          user_id: string;
          label: string;
          contact_name: string;
          phone: string;
          line1: string;
          line2: string | null;
          landmark: string | null;
          zone_id: string | null;
          pincode: string | null;
          lat: number | null;
          lng: number | null;
          is_default: boolean;
        } & Timestamps
      >;
      delivery_partners: Simple<
        {
          id: string;
          vendor_id: string | null;
          user_id: string | null;
          full_name: string;
          phone: string;
          vehicle: string | null;
          is_active: boolean;
          notes: string | null;
          deleted_at: string | null;
        } & Timestamps
      >;
      orders: Simple<
        {
          id: string;
          booking_id: string;
          store_id: string;
          vendor_id: string;
          kind: Database["public"]["Enums"]["store_kind"];
          zone_id: string;
          address: Json;
          status: Database["public"]["Enums"]["order_status"];
          prescription_id: string | null;
          partner_id: string | null;
          partner_name: string | null;
          partner_phone: string | null;
          eta_at: string | null;
          placed_at: string | null;
          accepted_at: string | null;
          ready_at: string | null;
          picked_up_at: string | null;
          delivered_at: string | null;
          delivery_otp: string | null;
          /** Service role only (column grant excludes it). */
          partner_token: string | null;
          partner_token_expires_at: string | null;
          rating: number | null;
          rating_comment: string | null;
          rated_at: string | null;
        } & Timestamps
      >;
      order_items: Simple<{
        id: string;
        order_id: string;
        item_id: string | null;
        variant_id: string | null;
        name: string;
        variant_name: string | null;
        addons: Json;
        diet: string | null;
        quantity: number;
        unit_price_paise: number;
        line_total_paise: number;
        sort_order: number;
      }>;
      order_events: Simple<{
        id: string;
        order_id: string;
        status: Database["public"]["Enums"]["order_status"];
        note: string | null;
        actor: string | null;
        source: "admin" | "vendor" | "partner" | "system" | "customer";
        created_at: string;
      }>;
      prescriptions: Simple<
        {
          id: string;
          user_id: string;
          patient_name: string;
          patient_age: number | null;
          phone: string;
          zone_id: string;
          address: Json;
          files: string[];
          notes: string | null;
          status: Database["public"]["Enums"]["prescription_status"];
          store_id: string | null;
          reviewed_by: string | null;
          review_note: string | null;
        } & Timestamps
      >;
      medicine_quotes: Simple<
        {
          id: string;
          prescription_id: string;
          store_id: string;
          lines: Json;
          delivery_fee_paise: number;
          note: string | null;
          valid_until: string;
          status: "sent" | "accepted" | "declined" | "expired" | "withdrawn";
          created_by: string | null;
        } & Timestamps
      >;
      packages: Simple<
        {
          id: string;
          slug: string;
          title: LocalizedJson;
          summary: LocalizedJson;
          description: LocalizedJson | null;
          category: string;
          destinations: string[];
          start_city: string | null;
          duration_days: number;
          duration_nights: number;
          image_id: string | null;
          gallery_ids: string[];
          highlights: LocalizedJson[];
          inclusions: LocalizedJson[];
          exclusions: LocalizedJson[];
          terms: LocalizedJson | null;
          booking_mode: Database["public"]["Enums"]["package_booking_mode"];
          fixed_departures: boolean;
          min_pax: number;
          max_pax: number;
          advance_percent: number | null;
          tax_bps: number;
          sac: string;
          rating: number | null;
          rating_count: number;
          is_featured: boolean;
          is_active: boolean;
          sort_order: number;
          deleted_at: string | null;
        } & Timestamps
      >;
      package_itinerary_days: Simple<
        {
          id: string;
          package_id: string;
          day_number: number;
          title: LocalizedJson;
          description: LocalizedJson | null;
          meals: ("breakfast" | "lunch" | "dinner")[];
          overnight: string | null;
        } & Timestamps
      >;
      package_pricing_tiers: Simple<
        {
          id: string;
          package_id: string;
          min_pax: number;
          max_pax: number;
          adult_price_paise: number;
          child_price_paise: number | null;
        } & Timestamps
      >;
      package_departures: Simple<
        {
          id: string;
          package_id: string;
          start_date: string;
          seats_total: number | null;
          supplement_paise: number;
          note: LocalizedJson | null;
          is_active: boolean;
        } & Timestamps
      >;
      package_bookings: Simple<
        {
          id: string;
          booking_id: string;
          package_id: string;
          departure_id: string | null;
          start_date: string;
          end_date: string;
          adults: number;
          children: number;
          travellers: Json;
          pickup_point: string | null;
        } & Timestamps
      >;
      leads: Simple<
        {
          id: string;
          number: number;
          user_id: string | null;
          kind: Database["public"]["Enums"]["lead_kind"];
          service_slug: string | null;
          package_id: string | null;
          name: string;
          phone: string;
          email: string | null;
          details: Json;
          message: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          lost_reason: string | null;
          assigned_to: string | null;
          assigned_at: string | null;
          source: string;
          utm: Json;
          referrer: string | null;
          landing_path: string | null;
          next_follow_up_at: string | null;
          last_contacted_at: string | null;
          value_paise: number | null;
          booking_id: string | null;
          locale: "en" | "hi";
          closed_at: string | null;
        } & Timestamps
      >;
      lead_activities: Simple<{
        id: string;
        lead_id: string;
        kind: Database["public"]["Enums"]["lead_activity_kind"];
        body: string | null;
        call_outcome: "connected" | "no_answer" | "busy" | "wrong_number" | "callback" | null;
        call_seconds: number | null;
        meta: Json;
        actor: string | null;
        created_at: string;
      }>;
      quotes: Simple<
        {
          id: string;
          lead_id: string;
          number: number;
          status: Database["public"]["Enums"]["quote_status"];
          title: string;
          lines: Json;
          subtotal_paise: number;
          tax_paise: number;
          total_paise: number;
          pay_now_paise: number;
          valid_until: string;
          notes: string | null;
          terms: string | null;
          token: string | null;
          booking_id: string | null;
          payment_link_url: string | null;
          created_by: string | null;
          sent_at: string | null;
          paid_at: string | null;
        } & Timestamps
      >;
      service_plans: Simple<
        {
          id: string;
          service_id: string;
          name: LocalizedJson;
          summary: LocalizedJson | null;
          price_paise: number | null;
          price_suffix: LocalizedJson | null;
          features: LocalizedJson[];
          is_popular: boolean;
          sort_order: number;
          is_published: boolean;
        } & Timestamps
      >;
      service_portfolio: Simple<
        {
          id: string;
          service_id: string;
          media_id: string | null;
          title: LocalizedJson;
          caption: LocalizedJson | null;
          client_name: string | null;
          link_url: string | null;
          sort_order: number;
          is_published: boolean;
        } & Timestamps,
        [MediaFk<"service_portfolio_media_id_fkey", "media_id">]
      >;
      partner_applications: Simple<
        {
          id: string;
          number: number;
          user_id: string;
          business_type: Database["public"]["Enums"]["partner_business_type"];
          business_name: string;
          contact_name: string;
          phone: string;
          email: string;
          city: string;
          address: string;
          gstin: string | null;
          pan: string | null;
          website: string | null;
          details: Json;
          message: string | null;
          documents: Json;
          agreement_version: string;
          agreement_name: string;
          agreement_accepted_at: string;
          status: Database["public"]["Enums"]["partner_application_status"];
          review_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          vendor_id: string | null;
          locale: "en" | "hi";
        } & Timestamps
      >;
      vendor_documents: Simple<
        {
          id: string;
          vendor_id: string;
          kind: string;
          file_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          expires_on: string | null;
          status: Database["public"]["Enums"]["vendor_document_status"];
          note: string | null;
          uploaded_by: string | null;
          verified_by: string | null;
          verified_at: string | null;
        } & Timestamps
      >;
      vendor_payouts: Simple<
        {
          id: string;
          number: number;
          vendor_id: string;
          period_end: string;
          entries_count: number;
          gross_paise: number;
          commission_paise: number;
          amount_paise: number;
          status: Database["public"]["Enums"]["payout_status"];
          provider: string;
          method: "bank_transfer" | "upi" | "cash" | "cheque" | "adjusted" | "other" | null;
          reference: string | null;
          notes: string | null;
          created_by: string | null;
          paid_by: string | null;
          paid_at: string | null;
          cancelled_at: string | null;
        } & Timestamps
      >;
      vendor_ledger_entries: Simple<
        {
          id: string;
          vendor_id: string;
          booking_id: string | null;
          kind: Database["public"]["Enums"]["ledger_entry_kind"];
          entry_date: string;
          gross_paise: number;
          platform_collected_paise: number;
          vendor_collected_paise: number;
          commission_paise: number;
          commission_tax_paise: number;
          tcs_paise: number;
          tds_paise: number;
          adjustment_paise: number;
          net_paise: number;
          commission_bps: number;
          commission_tax_bps: number;
          tcs_bps: number;
          tds_bps: number;
          note: string | null;
          payout_id: string | null;
          created_by: string | null;
        } & Timestamps
      >;
      reviews: Simple<
        {
          id: string;
          booking_id: string;
          user_id: string;
          subject_type: Database["public"]["Enums"]["review_subject"];
          hotel_id: string | null;
          package_id: string | null;
          store_id: string | null;
          service: Database["public"]["Enums"]["booking_service"];
          rating: number;
          title: string | null;
          body: string | null;
          author_name: string;
          locale: "en" | "hi";
          status: Database["public"]["Enums"]["review_status"];
          moderation_note: string | null;
          moderated_by: string | null;
          moderated_at: string | null;
          reply: string | null;
          replied_by: string | null;
          replied_at: string | null;
        } & Timestamps
      >;
      review_media: Simple<{
        id: string;
        review_id: string;
        file_path: string;
        sort_order: number;
        created_at: string;
      }>;
      wishlists: Simple<{
        id: string;
        user_id: string;
        subject_type: Database["public"]["Enums"]["wishlist_subject"];
        subject_id: string;
        created_at: string;
      }>;
      travellers: Simple<
        {
          id: string;
          user_id: string;
          full_name: string;
          relation: string | null;
          date_of_birth: string | null;
          gender: "female" | "male" | "other" | null;
          phone: string | null;
          is_default: boolean;
        } & Timestamps
      >;
      referrals: Simple<
        {
          id: string;
          referrer_id: string;
          referee_id: string;
          code: string;
          status: Database["public"]["Enums"]["referral_status"];
          booking_id: string | null;
          rewarded_at: string | null;
        } & Timestamps
      >;
      loyalty_ledger: Simple<{
        id: string;
        user_id: string;
        kind: Database["public"]["Enums"]["loyalty_kind"];
        points: number;
        booking_id: string | null;
        referral_id: string | null;
        review_id: string | null;
        coupon_id: string | null;
        base_paise: number | null;
        rate_bps: number | null;
        note: string | null;
        expires_at: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      customer_notes: Simple<
        {
          id: string;
          user_id: string;
          body: string;
          created_by: string | null;
        } & Timestamps
      >;
      rate_limit_hits: Simple<{
        bucket: string;
        window_start: string;
        hits: number;
      }>;
      privacy_requests: Simple<{
        id: string;
        user_id: string | null;
        email: string | null;
        kind: Database["public"]["Enums"]["privacy_request_kind"];
        status: Database["public"]["Enums"]["privacy_request_status"];
        reason: string | null;
        note: string | null;
        processed_by: string | null;
        processed_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
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
      can_read_booking: { Args: { p_booking_id: string }; Returns: boolean };
      create_hotel_booking: { Args: { p_booking: Json; p_items: Json; p_guests: Json }; Returns: Json };
      attach_payment_order: {
        Args: { p_booking_id: string; p_order_id: string; p_amount: number };
        Returns: string;
      };
      create_payment_link_payment: {
        Args: { p_booking_id: string; p_link_id: string; p_url: string; p_amount: number; p_actor: string };
        Returns: string;
      };
      record_payment: { Args: { p: Json }; Returns: Json };
      record_refund: { Args: { p: Json }; Returns: Json };
      cancel_booking: {
        Args: {
          p_booking_id: string;
          p_actor: string | null;
          p_reason: string | null;
          p_to?: Database["public"]["Enums"]["booking_status"];
        };
        Returns: Database["public"]["Tables"]["bookings"]["Row"];
      };
      record_offline_payment: {
        Args: {
          p_booking_id: string;
          p_amount: number;
          p_method: string;
          p_reference: string | null;
          p_actor: string;
        };
        Returns: string;
      };
      complete_booking: { Args: { p_booking_id: string; p_actor: string }; Returns: undefined };
      issue_invoice: { Args: { p_booking_id: string }; Returns: string };
      expire_stale_bookings: { Args: Record<PropertyKey, never>; Returns: number };
      can_read_trip: { Args: { p_trip_id: string }; Returns: boolean };
      create_cab_booking: { Args: { p_booking: Json; p_items: Json; p_trip: Json }; Returns: Json };
      assign_trip: {
        Args: { p_trip_id: string; p_driver_id: string; p_vehicle_id: string; p_actor: string };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      set_trip_status: {
        Args: {
          p_trip_id: string;
          p_status: Database["public"]["Enums"]["trip_status"];
          p_actor: string | null;
          p_source: "admin" | "driver" | "system";
          p_note?: string | null;
          p_otp?: string | null;
        };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      can_read_ride: { Args: { p_ride_id: string }; Returns: boolean };
      create_ride_booking: { Args: { p_booking: Json; p_items: Json; p_ride: Json }; Returns: Json };
      assign_ride: {
        Args: { p_ride_id: string; p_driver_id: string; p_vehicle_id: string | null; p_actor: string };
        Returns: Database["public"]["Tables"]["ride_requests"]["Row"];
      };
      set_ride_status: {
        Args: {
          p_ride_id: string;
          p_status: Database["public"]["Enums"]["ride_status"];
          p_actor: string | null;
          p_source: "admin" | "driver" | "system";
          p_note?: string | null;
          p_otp?: string | null;
        };
        Returns: Database["public"]["Tables"]["ride_requests"]["Row"];
      };
      rate_ride: {
        Args: { p_ride_id: string; p_user: string; p_rating: number; p_comment: string };
        Returns: Database["public"]["Tables"]["ride_requests"]["Row"];
      };
      can_manage_store: { Args: { p_store_id: string }; Returns: boolean };
      can_read_order: { Args: { p_order_id: string }; Returns: boolean };
      create_order: {
        Args: { p_booking: Json; p_items: Json; p_order: Json; p_order_items: Json };
        Returns: Json;
      };
      set_order_status: {
        Args: {
          p_order_id: string;
          p_status: Database["public"]["Enums"]["order_status"];
          p_actor: string | null;
          p_source: "admin" | "vendor" | "partner" | "system";
          p_note?: string | null;
          p_otp?: string | null;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      assign_delivery_partner: {
        Args: {
          p_order_id: string;
          p_partner_id: string;
          p_actor: string | null;
          p_source?: "admin" | "vendor";
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      rate_order: {
        Args: { p_order_id: string; p_user: string; p_rating: number; p_comment: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      submit_prescription: { Args: { p: Json }; Returns: string };
      my_order_otp: { Args: { p_order_id: string }; Returns: string | null };
      user_has_permission: { Args: { p_user_id: string; p_key: string }; Returns: boolean };
      package_departure_seats: {
        Args: { p_package_id: string };
        Returns: { departure_id: string; seats_left: number | null }[];
      };
      create_package_booking: { Args: { p_booking: Json; p_items: Json; p_package: Json }; Returns: Json };
      create_lead: { Args: { p: Json }; Returns: Json };
      assign_lead: {
        Args: { p_lead_id: string; p_assignee: string | null; p_actor: string };
        Returns: Database["public"]["Tables"]["leads"]["Row"];
      };
      set_lead_status: {
        Args: {
          p_lead_id: string;
          p_status: Database["public"]["Enums"]["lead_status"];
          p_actor: string;
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["leads"]["Row"];
      };
      log_lead_activity: {
        Args: {
          p_lead_id: string;
          p_kind: Database["public"]["Enums"]["lead_activity_kind"];
          p_body: string | null;
          p_actor: string;
          p_call_outcome?: string | null;
          p_call_seconds?: number | null;
          p_follow_up?: string | null;
          p_clear_follow_up?: boolean;
        };
        Returns: string;
      };
      save_quote: { Args: { p: Json; p_actor: string }; Returns: string };
      send_quote: {
        Args: { p_quote_id: string; p_booking: Json; p_token: string; p_actor: string };
        Returns: Json;
      };
      attach_quote_link: { Args: { p_quote_id: string; p_url: string }; Returns: undefined };
      cancel_quote: {
        Args: { p_quote_id: string; p_actor: string };
        Returns: Database["public"]["Tables"]["quotes"]["Row"];
      };
      record_quote_offline_payment: {
        Args: {
          p_quote_id: string;
          p_amount: number;
          p_method: string;
          p_reference: string | null;
          p_actor: string;
        };
        Returns: string;
      };
      submit_partner_application: { Args: { p: Json }; Returns: Json };
      review_partner_application: {
        Args: {
          p_id: string;
          p_status: Database["public"]["Enums"]["partner_application_status"];
          p_note: string | null;
          p_actor: string;
        };
        Returns: Database["public"]["Tables"]["partner_applications"]["Row"];
      };
      approve_partner_application: {
        Args: { p_id: string; p_commission_bps: number | null; p_actor: string };
        Returns: string;
      };
      booking_settlement_vendor: { Args: { p_booking_id: string }; Returns: string | null };
      sync_vendor_ledger: { Args: { p_booking_id: string }; Returns: undefined };
      add_vendor_adjustment: {
        Args: { p_vendor_id: string; p_amount: number; p_note: string; p_actor: string };
        Returns: string;
      };
      create_vendor_payout: {
        Args: { p_vendor_id: string; p_period_end: string; p_actor: string };
        Returns: Database["public"]["Tables"]["vendor_payouts"]["Row"];
      };
      mark_vendor_payout_paid: {
        Args: {
          p_id: string;
          p_method: string;
          p_reference: string | null;
          p_notes: string | null;
          p_actor: string;
        };
        Returns: Database["public"]["Tables"]["vendor_payouts"]["Row"];
      };
      update_vendor_profile: { Args: { p_vendor_id: string; p: Json; p_actor: string }; Returns: undefined };
      add_vendor_document: { Args: { p_vendor_id: string; p: Json; p_actor: string }; Returns: string };
      cancel_vendor_payout: {
        Args: { p_id: string; p_actor: string };
        Returns: Database["public"]["Tables"]["vendor_payouts"]["Row"];
      };
      review_target: { Args: { p_booking_id: string; p_user: string }; Returns: Json | null };
      submit_review: { Args: { p: Json }; Returns: Database["public"]["Tables"]["reviews"]["Row"] };
      moderate_review: {
        Args: {
          p_id: string;
          p_status: Database["public"]["Enums"]["review_status"];
          p_note: string | null;
          p_actor: string;
        };
        Returns: Database["public"]["Tables"]["reviews"]["Row"];
      };
      reply_review: {
        Args: { p_id: string; p_reply: string | null; p_actor: string };
        Returns: Database["public"]["Tables"]["reviews"]["Row"];
      };
      loyalty_balance: { Args: { p_user: string }; Returns: number };
      redeem_points: {
        Args: { p_user: string; p_points: number };
        Returns: Database["public"]["Tables"]["coupons"]["Row"];
      };
      adjust_points: {
        Args: { p_user: string; p_points: number; p_note: string; p_actor: string };
        Returns: string;
      };
      expire_loyalty_points: { Args: Record<string, never>; Returns: number };
      ensure_referral_code: { Args: { p_user: string }; Returns: string };
      claim_referral: { Args: { p_user: string; p_code: string }; Returns: string };
      report_dashboard: { Args: { p_from: string; p_to: string }; Returns: Json };
      report_pending_actions: { Args: { p_low_stock?: number }; Returns: Json };
      report_sales: {
        Args: { p_from: string; p_to: string };
        Returns: {
          day: string;
          service: Database["public"]["Enums"]["booking_service"];
          created: number;
          bookings: number;
          subtotal_paise: number;
          discount_paise: number;
          tax_paise: number;
          total_paise: number;
          paid_paise: number;
          refunded_paise: number;
          revenue_paise: number;
        }[];
      };
      report_occupancy: {
        Args: { p_from: string; p_to: string };
        Returns: {
          hotel_id: string;
          hotel_name: Json;
          rooms: number;
          available_nights: number;
          sold_nights: number;
          occupancy_bps: number;
          room_revenue_paise: number;
          adr_paise: number;
        }[];
      };
      report_vendor_performance: {
        Args: { p_from: string; p_to: string };
        Returns: {
          vendor_id: string;
          vendor_name: string;
          vendor_kind: Database["public"]["Enums"]["vendor_kind"];
          bookings: number;
          cancelled: number;
          gmv_paise: number;
          commission_paise: number;
          net_paise: number;
          rating_avg: number | null;
          rating_count: number;
        }[];
      };
      report_agent_performance: {
        Args: { p_from: string; p_to: string };
        Returns: {
          agent_id: string | null;
          agent_name: string | null;
          agent_email: string | null;
          leads: number;
          contacted: number;
          quoted: number;
          won: number;
          lost: number;
          open: number;
          won_value_paise: number;
          calls: number;
          win_rate_bps: number;
        }[];
      };
      report_coupon_usage: {
        Args: { p_from: string; p_to: string };
        Returns: {
          coupon_id: string | null;
          code: string;
          kind: string;
          redemptions: number;
          released: number;
          customers: number;
          discount_paise: number;
          gmv_paise: number;
        }[];
      };
      report_cancellations: {
        Args: { p_from: string; p_to: string };
        Returns: {
          service: Database["public"]["Enums"]["booking_service"];
          cancelled_by: string;
          reason: string;
          cancellations: number;
          total_paise: number;
          paid_paise: number;
          refunded_paise: number;
        }[];
      };
      admin_customers: {
        Args: {
          p_search?: string | null;
          p_blocked?: boolean | null;
          p_has_bookings?: boolean | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: string;
          email: string | null;
          full_name: string | null;
          phone: string | null;
          is_blocked: boolean;
          created_at: string;
          bookings: number;
          spend_paise: number;
          last_booking_at: string | null;
          total_count: number;
        }[];
      };
      admin_customer_summary: { Args: { p_user: string }; Returns: Json };
      hit_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; hits: number; retry_after: number }[];
      };
      purge_rate_limits: { Args: Record<string, never>; Returns: number };
      account_deletion_blockers: { Args: { p_user: string }; Returns: number };
      request_account_deletion: { Args: { p_user: string; p_reason: string | null }; Returns: string };
      cancel_account_deletion: { Args: { p_user: string }; Returns: boolean };
      log_data_export: { Args: { p_user: string }; Returns: string };
      resolve_privacy_request: {
        Args: {
          p_actor: string;
          p_id: string;
          p_status: Database["public"]["Enums"]["privacy_request_status"];
          p_note: string | null;
        };
        Returns: boolean;
      };
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
      booking_status:
        | "draft"
        | "pending_payment"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
        | "failed"
        | "expired";
      booking_service: "hotel" | "cab" | "ride" | "food" | "medicine" | "package" | "travel" | "essentials";
      payment_mode: "full" | "part" | "pay_at_hotel";
      payment_provider: "razorpay" | "offline";
      payment_status: "created" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded";
      refund_status: "pending" | "processed" | "failed";
      lock_status: "held" | "converted" | "released";
      coupon_discount: "percent" | "flat";
      notification_channel: "email" | "sms" | "whatsapp";
      notification_status: "sent" | "failed" | "skipped";
      cab_trip_type: "one_way" | "round_trip" | "local" | "transfer" | "sightseeing";
      cab_body_type: "hatchback" | "sedan" | "compact_suv" | "suv" | "muv" | "tempo_traveller" | "bus";
      fuel_type: "petrol" | "diesel" | "cng" | "electric";
      cab_place_kind: "city" | "station" | "airport" | "temple" | "landmark";
      trip_status:
        | "awaiting_payment"
        | "unassigned"
        | "assigned"
        | "en_route"
        | "arrived"
        | "picked_up"
        | "completed"
        | "cancelled"
        | "no_show";
      ride_mode: "point_to_point" | "hourly";
      ride_status:
        | "awaiting_payment"
        | "requested"
        | "assigned"
        | "en_route"
        | "arrived"
        | "picked_up"
        | "completed"
        | "cancelled"
        | "no_show";
      store_kind: "restaurant" | "grocery" | "pharmacy";
      order_status:
        | "awaiting_payment"
        | "placed"
        | "accepted"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
        | "rejected";
      prescription_status: "submitted" | "reviewing" | "quoted" | "ordered" | "rejected" | "expired";
      package_booking_mode: "enquiry" | "book";
      lead_kind: "package" | "flight" | "train" | "bus" | "hotel" | "cab" | "service" | "general";
      lead_status: "new" | "contacted" | "quoted" | "won" | "lost";
      lead_activity_kind:
        | "note"
        | "call"
        | "whatsapp"
        | "email"
        | "sms"
        | "status"
        | "assignment"
        | "quote"
        | "follow_up"
        | "system";
      quote_status: "draft" | "sent" | "paid" | "expired" | "cancelled";
      partner_business_type:
        | "hotel"
        | "travel_agency"
        | "restaurant"
        | "transport"
        | "shop"
        | "pharmacy"
        | "service_provider"
        | "other";
      partner_application_status: "submitted" | "under_review" | "approved" | "rejected";
      vendor_document_status: "pending" | "verified" | "rejected";
      ledger_entry_kind: "booking" | "adjustment" | "manual";
      payout_status: "pending" | "paid" | "cancelled";
      review_subject: "hotel" | "package" | "store" | "service";
      review_status: "pending" | "published" | "rejected";
      wishlist_subject: "hotel" | "package" | "store";
      loyalty_kind: "earn" | "reverse" | "redeem" | "restore" | "referral" | "review" | "adjust" | "expire";
      referral_status: "pending" | "rewarded" | "void";
      privacy_request_kind: "export" | "delete";
      privacy_request_status: "pending" | "completed" | "cancelled" | "rejected";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
