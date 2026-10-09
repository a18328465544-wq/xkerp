import {useSyncExternalStore} from "react";

/** The same phone boundary is used by shell, lists and workflows. Tablets
 * retain the master/detail workspace instead of inheriting phone-only steps. */
export const ERP_PHONE_QUERY = "(max-width: 767px)";
export const ERP_DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(query: string, listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const subscribePhone = (listener: () => void) => subscribe(ERP_PHONE_QUERY, listener);
const phoneSnapshot = () => window.matchMedia(ERP_PHONE_QUERY).matches;
const subscribeDesktop = (listener: () => void) => subscribe(ERP_DESKTOP_QUERY, listener);
const desktopSnapshot = () => window.matchMedia(ERP_DESKTOP_QUERY).matches;
const serverSnapshot = () => false;

export function useErpPhone() {
  return useSyncExternalStore(subscribePhone, phoneSnapshot, serverSnapshot);
}

/** Desktop-only page projections start at the finance layout boundary. */
export function useErpDesktop() {
  return useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
}
