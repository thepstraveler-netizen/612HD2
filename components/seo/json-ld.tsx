import { serializeJsonLd, type JsonLd as JsonLdData } from "@/lib/seo/jsonld";

/** Renders one or more schema.org objects as an escaped JSON-LD script tag. */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] | null | undefined }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
