/**
 * Push-notification permission, reduced to what the UI needs to decide.
 *
 * Kept free of expo imports so it can be unit-tested: the native module only
 * has to hand over the OS response (see mobile-app/src/notifications).
 */

export type PushPermissionState =
  /** Notifications are allowed. */
  | "granted"
  /** Never asked: the OS will show its prompt. */
  | "undetermined"
  /** The user said no. */
  | "denied"
  /** This platform can't receive push (web). */
  | "unsupported";

export interface PushPermission {
  state: PushPermissionState;
  /**
   * Whether the OS prompt can still appear. iOS shows it once; Android 13+
   * twice. When false, the only way back is the system settings screen.
   */
  canAskAgain: boolean;
}

/** Shape of expo-notifications' PermissionResponse (the fields we read). */
export interface OsPermissionResponse {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
}

export const PUSH_UNSUPPORTED: PushPermission = {
  state: "unsupported",
  canAskAgain: false,
};

export function permissionFromResponse(
  response: OsPermissionResponse
): PushPermission {
  if (response.granted === true || response.status === "granted") {
    return { state: "granted", canAskAgain: false };
  }
  if (response.status === "undetermined") {
    return { state: "undetermined", canAskAgain: true };
  }
  return { state: "denied", canAskAgain: response.canAskAgain === true };
}

/** Should an explicit "enable notifications" tap show the OS prompt? */
export function canShowOsPrompt(permission: PushPermission): boolean {
  return (
    permission.state === "undetermined" ||
    (permission.state === "denied" && permission.canAskAgain)
  );
}

/** Should the app offer the soft ask (onboarding step, profile button) at all? */
export function shouldOfferPush(permission: PushPermission): boolean {
  return permission.state !== "unsupported" && permission.state !== "granted";
}
