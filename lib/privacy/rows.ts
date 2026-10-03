/** Maps the P0001 messages of the privacy SQL functions to i18n error keys. */
export function privacyRpcError(
  message: string | undefined,
): "alreadyRequested" | "notFound" | "reasonRequired" | "invalidStatus" | null {
  switch (message?.trim()) {
    case "already_requested":
      return "alreadyRequested";
    case "not_found":
      return "notFound";
    case "reason_required":
      return "reasonRequired";
    case "invalid_status":
      return "invalidStatus";
    default:
      return null;
  }
}
