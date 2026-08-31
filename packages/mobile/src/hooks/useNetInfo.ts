import { useState, useEffect, useCallback } from "react";
import NetInfo, { NetInfoState as RNNetInfoState } from "@react-native-community/netinfo";

export interface NetInfoState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
}

const initialState: NetInfoState = {
  isConnected: true,
  isInternetReachable: true,
  type: "unknown",
};

function fromRNState(state: RNNetInfoState): NetInfoState {
  return {
    isConnected: state.isConnected ?? false,
    isInternetReachable: state.isInternetReachable,
    type: state.type,
  };
}

/**
 * Hook that tracks network connectivity status.
 *
 * Wraps @react-native-community/netinfo with a graceful fallback for
 * web environments where the native module may not be available.
 */
export function useNetInfo(): NetInfoState {
  const [state, setState] = useState<NetInfoState>(initialState);

  useEffect(() => {
    let mounted = true;

    // Initial fetch
    NetInfo.fetch()
      .then((info) => {
        if (mounted) setState(fromRNState(info));
      })
      .catch(() => {
        // Module not available — assume online
      });

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener((info) => {
      if (mounted) setState(fromRNState(info));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}
