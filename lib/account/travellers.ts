import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Gender } from "@/schemas/account";

export type TravellerRow = {
  id: string;
  fullName: string;
  relation: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string | null;
  isDefault: boolean;
};

/** The user's saved travellers, default first (RLS: own rows). */
export async function listTravellers(userId: string): Promise<TravellerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("travellers")
    .select("id, full_name, relation, date_of_birth, gender, phone, is_default")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(50);
  return (data ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    relation: r.relation,
    dateOfBirth: r.date_of_birth,
    gender: r.gender,
    phone: r.phone,
    isDefault: r.is_default,
  }));
}
