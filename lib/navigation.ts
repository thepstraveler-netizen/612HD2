/**
 * Header navigation. Until each vertical ships its own listing page
 * (/hotels in phase 3, /cabs in phase 5, …) the tabs open the matching
 * service page. From phase 2 the nav itself becomes CMS-managed.
 */
export const MAIN_NAV = [
  { key: "hotels", href: "/services/hotel-vendors" },
  { key: "cabs", href: "/services/car" },
  { key: "bikes", href: "/services/bike" },
  { key: "rickshaw", href: "/services/rickshaw" },
  { key: "food", href: "/services/food" },
  { key: "essentials", href: "/services/essentials" },
  { key: "medicine", href: "/services/medicine" },
  { key: "packages", href: "/services/travel-hotel-booking" },
  { key: "travel", href: "/services/travel-agent" },
  { key: "partner", href: "/partner" },
] as const;

export type MainNavKey = (typeof MAIN_NAV)[number]["key"];
