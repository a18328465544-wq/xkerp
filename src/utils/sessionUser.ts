/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafeSystemUserAccount, StoreRole } from "../types";

type CurrentUserLike = Partial<Pick<SafeSystemUserAccount, "displayName" | "username">> | null | undefined;

export function getDefaultHandlerName(
  currentUser: CurrentUserLike,
  currentRole: StoreRole | string,
  fallback = "经办人"
) {
  return currentUser?.displayName?.trim() || currentUser?.username?.trim() || currentRole || fallback;
}

export function shouldUseLoggedInDefault(
  currentValue: string,
  defaultHandlerName: string,
  legacyValues: string[] = []
) {
  const value = currentValue.trim();
  return !value || value === defaultHandlerName || legacyValues.includes(value);
}

export function getLockedHandlerFieldState(
  currentUser: CurrentUserLike,
  currentRole: StoreRole | string,
  fallback = "经办人"
) {
  return {
    value: getDefaultHandlerName(currentUser, currentRole, fallback),
    readOnly: true,
    disabled: true
  };
}
