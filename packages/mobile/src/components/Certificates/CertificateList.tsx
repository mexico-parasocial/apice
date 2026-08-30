import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Certificate } from "../../hooks/useCertificates";

export interface CertificateListProps {
  certificates: Certificate[];
  onDownload: (certificate: Certificate) => void;
  emptyText?: string;
}

/**
 * One row, memoized: the parent re-renders whenever any of its state
 * changes, but a row's props (data + stable callback) rarely do — so rows
 * stop re-rendering wholesale on every parent tick.
 */
const CertificateRow = React.memo(function CertificateRow({
  certificate,
  onDownload,
  isDark,
}: {
  certificate: Certificate;
  onDownload: (certificate: Certificate) => void;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#1F1B2E" : "#FFFFFF",
          borderColor: isDark ? "#374151" : "#E5E7EB",
        },
      ]}
    >
      <View style={styles.info}>
        <Text
          style={[
            styles.courseName,
            { color: isDark ? "#FFFFFF" : "#1F1B2E" },
          ]}
          numberOfLines={2}
        >
          {certificate.courseName}
        </Text>
        <Text
          style={[
            styles.date,
            { color: isDark ? "#9CA3AF" : "#6B7280" },
          ]}
        >
          {new Date(certificate.issuedAt).toLocaleDateString("es-MX", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() => onDownload(certificate)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Descargar certificado de ${certificate.courseName}`}
      >
        <Ionicons
          name="download-outline"
          size={24}
          color={isDark ? "#FFFFFF" : "#4A1052"}
        />
      </TouchableOpacity>
    </View>
  );
});

export default function CertificateList({
  certificates,
  onDownload,
  emptyText = "Aún no tienes certificados. Completa un programa para obtener uno.",
}: CertificateListProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  if (certificates.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="school-outline"
          size={48}
          color={isDark ? "#6B7280" : "#9CA3AF"}
        />
        <Text
          style={[
            styles.emptyText,
            { color: isDark ? "#D1D5DB" : "#6B7280" },
          ]}
        >
          {emptyText}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={certificates}
      keyExtractor={(certificate) => certificate.id}
      renderItem={({ item }) => (
        <CertificateRow
          certificate={item}
          onDownload={onDownload}
          isDark={isDark}
        />
      )}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  courseName: {
    fontFamily: "Raleway_700Bold",
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
  },
  date: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
  },
  downloadButton: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: "rgba(74, 16, 82, 0.08)",
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 16,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
