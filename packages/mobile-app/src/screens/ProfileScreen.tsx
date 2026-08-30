import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  AlfText,
  atoms as a,
  ContentContainer,
  downloadCertificate,
  makeIM8AuthHooks,
  makePasswordAuthHooks,
  makeCertificateHooks,
  useTheme,
  CertificateList,
} from "@apice/mobile";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import {
  useIM8Login,
  usePasswordLogin,
  useMyCertificates,
  getCertificateDownloadUrl,
} from "@/api/hooks";
import { useAuth } from "@/hooks/useAuth";
import { WelcomeLogin } from "@/components/WelcomeLogin";

/**
 * Seeded demo learner (server/scripts/seed-demo-users.ts). Exposed only behind
 * __DEV__ as a one-tap prefill so demos don't depend on iM8 being up.
 */
const DEMO_ACCOUNT = {
  email: "demo@apice.local",
  password: "Demo1234!",
};

export function ProfileScreen() {
  const theme = useTheme();
  const { token, user, login, logout } = useAuth();
  const [identifier, setIdentifier] = useState("demo.im8");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { mutate: passwordLogin, isPending: isEmailLoading } = usePasswordLogin({
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken ?? null, data.user);
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ||
          err?.message ||
          "Correo o contraseña incorrectos"
      );
    },
  });
  const { login: startIM8Login, isPending: isLoggingIn } = useIM8Login({
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken ?? null, data.user);
    },
    onError: (err) => {
      alert("Login failed: " + (err as any)?.message);
    },
  });

  const { data: certs, isLoading: certsLoading } = useMyCertificates({
    enabled: !!token,
  });

  const { data: notificationsData } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: async () => {
      const res = await api.get("/notifications");
      return res.data;
    },
    enabled: !!token,
  });
  const notifications = notificationsData?.notifications ?? [];

  if (!user) {
    return (
      <WelcomeLogin
        email={email}
        onChangeEmail={setEmail}
        password={password}
        onChangePassword={setPassword}
        onEmailSubmit={() => passwordLogin({ email, password })}
        isEmailLoading={isEmailLoading}
        // Dev/demo builds only — never ships a credential in a release binary.
        onUseDemoAccount={
          __DEV__
            ? () => {
                setEmail(DEMO_ACCOUNT.email);
                setPassword(DEMO_ACCOUNT.password);
              }
            : undefined
        }
        identifier={identifier}
        onChangeIdentifier={setIdentifier}
        onSubmit={() => startIM8Login(identifier)}
        isLoading={isLoggingIn}
      />
    );
  }

  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ContentContainer>
        <AlfText variant="heading" color="primary_800" style={a.mb_lg}>
          Perfil
        </AlfText>

        <View style={[theme.atoms.bg_contrast_25, styles.card]}>
          <AlfText variant="title">{user.name}</AlfText>
          <AlfText variant="body" color="contrast_600" style={a.mt_xs}>
            {user.email}
          </AlfText>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>

        <AlfText variant="title" color="primary_800" style={styles.sectionTitle}>
          Notificaciones
        </AlfText>
        {notifications.length === 0 ? (
          <View style={[theme.atoms.bg_contrast_25, styles.card]}>
            <AlfText variant="body" color="contrast_600">
              No tienes notificaciones todavía.
            </AlfText>
          </View>
        ) : (
          notifications.slice(0, 10).map((n: any) => (
            <View
              key={n.id}
              style={[theme.atoms.bg_contrast_25, styles.card]}
            >
              <AlfText variant="caption" color="primary_800">
                {n.title}
              </AlfText>
              <AlfText variant="body" color="contrast_600" style={a.mt_xs}>
                {n.message}
              </AlfText>
            </View>
          ))
        )}

        <AlfText variant="title" color="primary_800" style={styles.sectionTitle}>
          Mis certificados
        </AlfText>
        {certsLoading ? (
          <ActivityIndicator color={theme.palette.primary_800} />
        ) : (
          <CertificateList
            certificates={certs?.certificates ?? []}
            onDownload={async (cert) => {
              try {
                await downloadCertificate({
                  url: getCertificateDownloadUrl(cert.id),
                  accessToken: token ?? "",
                  fileName: `certificado-${cert.courseName
                    .toLowerCase()
                    .replace(/\s+/g, "-")}.svg`,
                });
              } catch (err: any) {
                alert(err?.message || "No se pudo descargar el certificado");
              }
            }}
          />
        )}
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  // No backgroundColor here — theme.atoms.bg_contrast_25 (applied first in
  // the style array on the View) supplies it, so cards actually track
  // light/dark mode instead of always rendering a fixed light-gray card that
  // white/pale theme text loses almost all contrast against.
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  logoutButton: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  // Red-on-card reads fine in both themes without help from the palette, so
  // this one stays a fixed color deliberately (matches theme.palette.negative_500).
  logoutText: {
    color: "#E91646",
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
  },
  // No `color` here — set via the `color="primary_800"` prop on AlfText
  // instead, so it resolves through the palette per theme rather than
  // fighting it with a hardcoded hex.
  sectionTitle: {
    fontFamily: "Raleway_700Bold",
    fontSize: 20,
    marginTop: 8,
    marginBottom: 12,
  },
});
