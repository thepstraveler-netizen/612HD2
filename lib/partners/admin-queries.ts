import "server-only";
import { assertPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationFilters, VendorFilters } from "@/schemas/vendor-admin";
import type { Tables } from "@/types/database";
import { readApplicationDocuments, type ApplicationDocument } from "./admin-rows";

/**
 * Admin reads for Admin → Vendors. Applications, vendors, members and
 * documents are read as the signed-in user (RLS: vendors.read). Member
 * names live in `profiles`, which only customers.read may list, and
 * document links are signed by the service role; both happen only after
 * {@link assertPermission} for vendors.read, and only names/links leave.
 */

const BUCKET = "documents";
/** Download links are short-lived: long enough to click, not to share. */
const SIGNED_URL_SECONDS = 300;

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[vendors admin] ${scope}: ${error.message}`);
}

/** PostgREST `or` filter value: strip characters that would break the expression. */
function searchTerm(q: string): string {
  return q.replace(/[%,()*\\]/g, " ").trim();
}

/** Signed download links for private documents, keyed by path (missing files are left out). */
async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  await assertPermission("vendors.read");
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS, { download: true });
  if (error) {
    console.error("[vendors admin] signing documents failed", error);
    return out;
  }
  for (const item of data) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

async function profileNames(ids: string[]) {
  const wanted = [...new Set(ids)];
  const out = new Map<string, { name: string | null; email: string | null; phone: string | null }>();
  if (!wanted.length) return out;
  await assertPermission("vendors.read");
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, email, phone")
    .in("id", wanted);
  if (error) fail("profiles", error);
  for (const p of data) out.set(p.id, { name: p.full_name, email: p.email, phone: p.phone });
  return out;
}

// ---------------------------------------------------------------- applications

export type ApplicationListRow = Pick<
  Tables<"partner_applications">,
  "id" | "number" | "business_name" | "business_type" | "contact_name" | "city" | "status" | "created_at"
>;

export async function listApplications(filters: ApplicationFilters): Promise<ApplicationListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("partner_applications")
    .select("id, number, business_name, business_type, contact_name, city, status, created_at")
    .order("created_at", { ascending: filters.status === "open" })
    .limit(500);
  if (filters.status === "open") query = query.in("status", ["submitted", "under_review"]);
  else if (filters.status !== "all") query = query.eq("status", filters.status);
  const q = filters.q ? searchTerm(filters.q) : "";
  if (q) {
    const n = /^(PA-)?0*(\d{1,9})$/i.exec(q);
    query = n
      ? query.eq("number", Number(n[2]))
      : query.or(`business_name.ilike.%${q}%,contact_name.ilike.%${q}%,city.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) fail("applications", error);
  return data;
}

export async function countOpenApplications(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("partner_applications")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "under_review"]);
  if (error) fail("open applications", error);
  return count ?? 0;
}

export type SignedDocument = ApplicationDocument & { url: string | null };

export type AdminApplication = {
  app: Tables<"partner_applications">;
  documents: SignedDocument[];
  reviewer: string | null;
  vendorName: string | null;
};

export async function getApplication(id: string): Promise<AdminApplication | null> {
  const supabase = await createClient();
  const { data: app, error } = await supabase.from("partner_applications").select("*").eq("id", id).maybeSingle();
  if (error) fail("application", error);
  if (!app) return null;
  const docs = readApplicationDocuments(app.documents);
  const [urls, people, vendor] = await Promise.all([
    signedUrls(docs.map((d) => d.path)),
    profileNames(app.reviewed_by ? [app.reviewed_by] : []),
    app.vendor_id
      ? supabase.from("vendors").select("name").eq("id", app.vendor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const reviewer = app.reviewed_by ? people.get(app.reviewed_by) : undefined;
  return {
    app,
    documents: docs.map((d) => ({ ...d, url: urls.get(d.path) ?? null })),
    reviewer: reviewer ? (reviewer.name ?? reviewer.email) : null,
    vendorName: vendor.data?.name ?? null,
  };
}

// ---------------------------------------------------------------- vendors

export type VendorListRow = Pick<
  Tables<"vendors">,
  "id" | "name" | "kind" | "status" | "city" | "phone" | "commission_bps" | "created_at"
>;

export async function listVendors(filters: VendorFilters): Promise<VendorListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("vendors")
    .select("id, name, kind, status, city, phone, commission_bps, created_at")
    .is("deleted_at", null)
    .order("name")
    .limit(1000);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.status) query = query.eq("status", filters.status);
  const q = filters.q ? searchTerm(filters.q) : "";
  if (q) query = query.or(`name.ilike.%${q}%,contact_name.ilike.%${q}%,city.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) fail("vendors", error);
  return data;
}

export type VendorMember = {
  userId: string;
  role: "owner" | "staff";
  name: string | null;
  email: string | null;
  phone: string | null;
  since: string;
};

export type VendorDocumentRow = Tables<"vendor_documents"> & { url: string | null };

export type AdminVendor = {
  vendor: Tables<"vendors">;
  members: VendorMember[];
  documents: VendorDocumentRow[];
  applicationNumber: number | null;
};

export async function getVendor(id: string): Promise<AdminVendor | null> {
  const supabase = await createClient();
  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("vendor", error);
  if (!vendor) return null;
  const [members, documents, application] = await Promise.all([
    supabase.from("vendor_members").select("user_id, role, created_at").eq("vendor_id", id).order("created_at"),
    supabase.from("vendor_documents").select("*").eq("vendor_id", id).order("created_at", { ascending: false }),
    vendor.application_id
      ? supabase.from("partner_applications").select("number").eq("id", vendor.application_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (members.error) fail("members", members.error);
  if (documents.error) fail("documents", documents.error);
  const [people, urls] = await Promise.all([
    profileNames(members.data.map((m) => m.user_id)),
    signedUrls(documents.data.map((d) => d.file_path)),
  ]);
  return {
    vendor,
    members: members.data.map((m) => {
      const p = people.get(m.user_id);
      return {
        userId: m.user_id,
        role: m.role,
        name: p?.name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        since: m.created_at,
      };
    }),
    documents: documents.data.map((d) => ({ ...d, url: urls.get(d.file_path) ?? null })),
    applicationNumber: application.data?.number ?? null,
  };
}
