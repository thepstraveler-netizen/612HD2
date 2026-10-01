import { notFound } from "next/navigation";

/** Sends unknown paths inside a locale to the localized not-found page. */
export default function CatchAll() {
  notFound();
}
