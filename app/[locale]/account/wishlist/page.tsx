import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WishlistGrid } from "@/components/wishlist/wishlist-grid";
import { requireUser } from "@/lib/auth/guards";
import { listWishlist } from "@/lib/wishlist/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wishlist");
  return { title: t("title"), robots: { index: false } };
}

export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account/wishlist");
  const t = await getTranslations("wishlist");
  const items = await listWishlist(session.user.id, locale);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <WishlistGrid items={items} locale={locale} />
    </div>
  );
}
