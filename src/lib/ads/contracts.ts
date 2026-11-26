/** No payment-provider, browser or environment dependencies: this is the value boundary. */
export const ADS_CONSENT_VERSION = "2026-11-26.1";
export const ADS_COOKIE = "westmere-ad-measurement";
export const ADS_OPTOUT_COOKIE = "westmere-ad-optout";
export type AdIdentifiers = {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
};
export type AdsConsent = {
  measurement: boolean;
  adUserData: boolean;
  enhanced: boolean;
  version: string;
};
export type RegistrationConversion = {
  id: string;
  transactionId: string;
  sendTo: string;
  value: 0;
  currency: "AUD";
  emailHash?: string;
};
export type AdsBrowserState = {
  enabled: boolean;
  delivery: boolean;
  tagId: string;
  enhancedAvailable: boolean;
  consent: AdsConsent | null;
  registration: RegistrationConversion | null;
};
export const deniedGoogleConsent = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;
export function googleConsent(consent: AdsConsent) {
  return {
    ...deniedGoogleConsent,
    ad_storage: consent.measurement ? "granted" : "denied",
    ad_user_data: consent.adUserData ? "granted" : "denied",
  };
}
export function clickIdentifiers(
  input: Record<string, unknown>,
): AdIdentifiers {
  const result: AdIdentifiers = {};
  for (const key of ["gclid", "gbraid", "wbraid"] as const) {
    const value = input[key];
    if (typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value))
      result[key] = value;
  }
  return result;
}
export function hasMatchingSignal(
  ids: AdIdentifiers,
  emailHash?: string | null,
) {
  return (
    Object.keys(clickIdentifiers(ids)).length > 0 ||
    /^[a-f0-9]{64}$/.test(emailHash || "")
  );
}
export function acquisitionValue(gross: number, gst: number): number {
  if (
    !Number.isSafeInteger(gross) ||
    !Number.isSafeInteger(gst) ||
    gross <= 0 ||
    gst < 0 ||
    gst >= gross
  )
    throw new Error("INVALID_REVENUE_ALLOCATION");
  return gross - gst;
}
export function isEmployerPath(path: string) {
  return (
    path === "/" ||
    path === "/launch" ||
    /^\/(launch\/)?(employers|register|sign-in)(\/|$)/.test(path)
  );
}
