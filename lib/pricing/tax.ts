import { z } from "zod";

/**
 * GST on accommodation is decided by the tariff of one room for one night.
 * Slabs live in the `tax.hotel_gst_slabs` setting so a rate change needs no
 * deploy. Slabs are checked in order; the first whose max covers the tariff
 * applies, and a slab with `max_tariff_paise: null` covers everything above.
 */
export const gstSlabsSchema = z
  .array(
    z.object({
      max_tariff_paise: z.number().int().positive().nullable(),
      rate_bps: z.number().int().min(0).max(10_000),
    }),
  )
  .min(1);

export type GstSlab = z.infer<typeof gstSlabsSchema>[number];

/** Used only if the setting is missing or invalid; mirrors the baseline migration. */
export const DEFAULT_GST_SLABS: GstSlab[] = [
  { max_tariff_paise: 100_000, rate_bps: 0 },
  { max_tariff_paise: 750_000, rate_bps: 500 },
  { max_tariff_paise: null, rate_bps: 1_800 },
];

export function gstRateBps(slabs: readonly GstSlab[], tariffPaise: number): number {
  for (const slab of slabs) {
    if (slab.max_tariff_paise === null || tariffPaise <= slab.max_tariff_paise) return slab.rate_bps;
  }
  return slabs[slabs.length - 1]?.rate_bps ?? 0;
}

/** Tax on one room-night, rounded to the nearest paisa. */
export function gstForRoomNight(slabs: readonly GstSlab[], tariffPaise: number): number {
  return Math.round((tariffPaise * gstRateBps(slabs, tariffPaise)) / 10_000);
}
