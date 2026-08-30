import React from "react";
import { useFonts } from "expo-font";
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import { Raleway_700Bold } from "@expo-google-fonts/raleway";
// Montserrat is the wordmark face — logo only, not body copy.
import {
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from "@expo-google-fonts/montserrat";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/hooks/useAuth";
import { RootNavigator } from "@/navigation/RootNavigator";
import { ThemeProvider, VideoVolumeProvider } from "@apice/mobile";

import { Platform, View, ActivityIndicator } from "react-native";
import { initSentry } from "@/observability/sentry";

// Before anything else mounts, so a crash during font loading or the first
// navigation still reaches Sentry.
initSentry();

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

// Defaults matter more than they look: with TanStack Query's stock
// staleTime of 0 every cached query is instantly stale, so each tab switch
// remounts a screen and refetches every list — the app felt network-bound
// on navigation. One minute of freshness kills most of that traffic
// without users ever noticing stale data.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Raleway_700Bold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  React.useEffect(() => {
    if ((fontsLoaded || fontError) && Platform.OS !== "web") {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && Platform.OS !== "web") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#4A1052" }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <VideoVolumeProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </VideoVolumeProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
