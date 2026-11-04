import { Platform, useWindowDimensions } from "react-native";

/**
 * Layout breakpoints.
 *
 * `desktop` is the point where a bottom tab bar stops being the right chrome:
 * on a wide pointer-driven screen the primary navigation belongs at the side,
 * and body text needs a max width so it doesn't run the full monitor.
 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
} as const;

/** Max width for reading content on wide screens (roughly 75 characters). */
export const CONTENT_MAX_WIDTH = 720;

export interface Breakpoint {
  width: number;
  height: number;
  isTablet: boolean;
  /**
   * Wide screen AND running on web. Native tablets keep the touch-first
   * layout — a side rail is a pointer affordance, not just a width one.
   */
  isDesktopWeb: boolean;
  isWeb: boolean;
}

export function useBreakpoint(): Breakpoint {
  // useWindowDimensions (not Dimensions.get) so a browser resize actually
  // re-renders — module-scope Dimensions.get freezes at load time on web.
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  return {
    width,
    height,
    isWeb,
    isTablet: width >= BREAKPOINTS.tablet,
    isDesktopWeb: isWeb && width >= BREAKPOINTS.desktop,
  };
}
