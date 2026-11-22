/** Real delivery never targets reserved documentation, test or local domains. */
export function isDeliverableRecipient(address: string): boolean {
  const parts = address.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || /[\s<>\r\n]/.test(address))
    return false;
  const domain = parts[1];
  return (
    domain.includes(".") &&
    !/(^|\.)(invalid|test|localhost|example|example\.com|example\.net|example\.org)$/.test(
      domain,
    )
  );
}
