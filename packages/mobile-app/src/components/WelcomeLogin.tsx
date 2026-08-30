import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { baseTheme } from "@apice/mobile";

export interface WelcomeLoginProps {
  /** Email + password — the account path, works without any external service. */
  email: string;
  onChangeEmail: (value: string) => void;
  password: string;
  onChangePassword: (value: string) => void;
  onEmailSubmit: () => void;
  isEmailLoading?: boolean;
  /** Prefills the demo account. Only rendered when provided (dev builds). */
  onUseDemoAccount?: () => void;

  /** iM8 handle — the federated identity path. */
  identifier: string;
  onChangeIdentifier: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function WelcomeLogin({
  email,
  onChangeEmail,
  password,
  onChangePassword,
  onEmailSubmit,
  isEmailLoading,
  onUseDemoAccount,
  identifier,
  onChangeIdentifier,
  onSubmit,
  isLoading,
}: WelcomeLoginProps) {
  // Reactive: rotation and split-screen change the window width after mount —
  // the old module-scope Dimensions.get froze it at import time.
  const { width } = useWindowDimensions();

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(28)).current;
  const heroScale = useRef(new Animated.Value(0.92)).current;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(48)).current;

  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 750,
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslateY, {
        toValue: 0,
        duration: 750,
        useNativeDriver: true,
      }),
      Animated.spring(heroScale, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 650,
      delay: 300,
      useNativeDriver: true,
    }).start();

    Animated.timing(cardTranslateY, {
      toValue: 0,
      duration: 650,
      delay: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const canSubmit = identifier.trim().length > 0 && !isLoading;
  const canSubmitEmail =
    email.trim().length > 0 && password.length > 0 && !isEmailLoading;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.hero,
              {
                opacity: heroOpacity,
                transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
              },
            ]}
          >
            <View style={styles.logoRing}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoLetter}>Á</Text>
              </View>
            </View>
            <Text style={styles.title}>Ápice</Text>
            <Text style={[styles.subtitle, { maxWidth: width * 0.75 }]}>
              Aprende, participa y construye ciudadanía.
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslateY }],
              },
            ]}
          >
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={onChangeEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="tu@correo.com"
              placeholderTextColor="#9CA3AF"
              returnKeyType="next"
              editable={!isEmailLoading}
            />

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={onChangePassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              returnKeyType="go"
              onSubmitEditing={onEmailSubmit}
              editable={!isEmailLoading}
            />

            <TouchableOpacity
              activeOpacity={1}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={onEmailSubmit}
              disabled={!canSubmitEmail}
              accessibilityRole="button"
              accessibilityLabel="Entrar con correo electrónico"
            >
              <Animated.View
                style={[
                  styles.button,
                  !canSubmitEmail && styles.buttonDisabled,
                  { transform: [{ scale: buttonScale }] },
                ]}
              >
                {isEmailLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Entrar</Text>
                )}
              </Animated.View>
            </TouchableOpacity>

            {onUseDemoAccount && (
              <TouchableOpacity
                onPress={onUseDemoAccount}
                accessibilityRole="button"
                accessibilityLabel="Rellenar con la cuenta de demostración"
              >
                <Text style={styles.demoLink}>Usar cuenta de demostración</Text>
              </TouchableOpacity>
            )}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.label}>Usuario de iM8 / handle</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={onChangeIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ej. usuario.im8"
              placeholderTextColor="#9CA3AF"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              editable={!isLoading}
            />

            <TouchableOpacity
              activeOpacity={1}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={onSubmit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Entrar con iM8"
            >
              <Animated.View
                style={[
                  styles.button,
                  styles.buttonSecondary,
                  !canSubmit && styles.buttonDisabled,
                  { transform: [{ scale: buttonScale }] },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator color={baseTheme.colors.primary} />
                ) : (
                  <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                    Entrar con iM8
                  </Text>
                )}
              </Animated.View>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Identidad federada iM8. Requiere el servicio de identidad activo.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: baseTheme.colors.primary,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  hero: {
    alignItems: "center",
    marginTop: 48,
  },
  logoRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: {
    fontFamily: baseTheme.fonts.wordmark,
    fontSize: 44,
    color: baseTheme.colors.primary,
  },
  title: {
    fontFamily: baseTheme.fonts.wordmark,
    fontSize: 42,
    letterSpacing: -0.8,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: baseTheme.fonts.body,
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    paddingBottom: 28,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  label: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: "#374151",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: baseTheme.fonts.body,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    color: baseTheme.colors.text,
    marginBottom: 16,
  },
  button: {
    backgroundColor: baseTheme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: baseTheme.colors.primary,
  },
  demoLink: {
    fontFamily: baseTheme.fonts.body,
    fontSize: 13,
    color: baseTheme.colors.primary,
    textAlign: "center",
    marginTop: 12,
    textDecorationLine: "underline",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerLabel: {
    fontFamily: baseTheme.fonts.body,
    fontSize: 12,
    color: "#9CA3AF",
    marginHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonTextSecondary: {
    color: baseTheme.colors.primary,
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
  },
  hint: {
    fontFamily: baseTheme.fonts.body,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 16,
  },
});
