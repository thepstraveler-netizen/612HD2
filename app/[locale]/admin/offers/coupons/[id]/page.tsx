import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { BookingsDeleteButton } from "@/components/admin/booking-shared";
import { CouponForm } from "@/components/admin/coupon-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminCoupon, listCouponHotelOptions } from "@/lib/bookings/admin";
import { deleteCoupon } from "@/lib/bookings/admin-actions";
import { EMPTY_COUPON_FORM, couponFormValues } from "@/lib/bookings/admin-forms";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/offers/coupons";

/**
 * Dates are passed to the form as ISO strings and converted to the
 * browser's local time inside the client form (the server's zone is UTC).
 */
export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("offers.write", `${LIST}/${raw}`);
  const [t, locale, coupon, hotels] = await Promise.all([
    getTranslations("bookingsAdmin.coupons"),
    getLocale(),
    id ? getAdminCoupon(id) : Promise.resolve(null),
    listCouponHotelOptions(),
  ]);
  if (!isNew && !coupon) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={coupon ? coupon.code : t("new")}
        lead={coupon ? t("usedCount", { count: coupon.used }) : undefined}
        backHref={LIST}
        backLabel={t("backToList")}
      />
      <CouponForm
        defaultValues={coupon ? couponFormValues(coupon) : EMPTY_COUPON_FORM}
        hotels={hotels.map((h) => ({ value: h.id, label: pickLocalized(h.name, locale) }))}
        listHref={LIST}
        deleteButton={
          coupon && coupon.used === 0 ? (
            <BookingsDeleteButton id={coupon.id} action={deleteCoupon} redirectTo={LIST} />
          ) : undefined
        }
      />
    </div>
  );
}
