import {
  deniedGoogleConsent,
  googleConsent,
  type AdsConsent,
  type RegistrationConversion,
} from "./contracts";
export type GoogleTag = (...args: unknown[]) => void;
export function initializeGoogleTag(
  gtag: GoogleTag,
  tagId: string,
  consent: AdsConsent,
  location: string,
) {
  gtag("consent", "default", deniedGoogleConsent);
  gtag("set", "ads_data_redaction", true);
  gtag("set", "user_data", null);
  gtag("consent", "update", googleConsent(consent));
  gtag("js", new Date());
  gtag("config", tagId, {
    send_page_view: false,
    allow_enhanced_conversions: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: location,
    page_referrer: "",
  });
}
export function queueRegistration(
  gtag: GoogleTag,
  event: RegistrationConversion,
  consent: AdsConsent,
  location: string,
  callback: () => void,
) {
  if (!consent.measurement || !consent.adUserData) return false;
  gtag("set", "user_data", null);
  if (consent.enhanced && event.emailHash)
    gtag("set", "user_data", { sha256_email_address: event.emailHash });
  const tagId = event.sendTo.split("/")[0];
  gtag("config", tagId, {
    send_page_view: false,
    allow_enhanced_conversions: Boolean(consent.enhanced && event.emailHash),
  });
  gtag("event", "conversion", {
    send_to: event.sendTo,
    value: 0,
    currency: "AUD",
    transaction_id: event.transactionId,
    page_location: location,
    page_referrer: "",
    event_timeout: 2000,
    event_callback: callback,
  });
  gtag("set", "user_data", null);
  gtag("config", tagId, {
    send_page_view: false,
    allow_enhanced_conversions: false,
  });
  return true;
}
