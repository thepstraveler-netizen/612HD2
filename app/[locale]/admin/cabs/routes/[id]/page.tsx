import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { RouteFaresForm, RouteForm } from "@/components/admin/cab-route-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getRoute, listCategories, listPlaces } from "@/lib/cabs/admin";
import { deleteRoute } from "@/lib/cabs/admin-actions";
import { NEW_ROUTE, routeFaresValues, routeFormValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/cabs/routes";

/** Route details; once saved, its per-category fixed fares below. */
export default async function EditCabRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, locale, places, categories, detail] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listPlaces(),
    listCategories(),
    id ? getRoute(id) : null,
  ]);
  if (id && !detail) notFound();
  if (!detail && places.length === 0) notFound();
  const placeName = new Map(places.map((p) => [p.id, pickLocalized(p.name, locale)]));
  const title = detail
    ? detail.route.name?.en
      ? pickLocalized(detail.route.name, locale)
      : `${placeName.get(detail.route.from_place_id) ?? ""} → ${placeName.get(detail.route.to_place_id) ?? ""}`
    : t("routes.newTitle");

  return (
    <div className="space-y-6">
      <AdminPageHeader title={title} backHref={LIST} backLabel={t("routes.title")} />
      <RouteForm
        defaultValues={
          detail
            ? routeFormValues(detail.route)
            : {
                ...NEW_ROUTE,
                from_place_id: places[0]?.id ?? "",
                to_place_id: places[1]?.id ?? places[0]?.id ?? "",
              }
        }
        places={places.map((p) => ({ value: p.id, label: p.name }))}
        editHref={LIST}
        deleteButton={
          id ? (
            <CabDeleteButton
              id={id}
              action={deleteRoute}
              redirectTo={LIST}
              confirmText={t("routes.confirmDelete")}
            />
          ) : undefined
        }
      />
      {detail ? (
        <RouteFaresForm
          defaultValues={routeFaresValues(detail.route.id, categories, detail.fares)}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
      ) : (
        <p className="max-w-3xl text-sm text-muted-foreground">{t("routes.faresAfterSave")}</p>
      )}
    </div>
  );
}
