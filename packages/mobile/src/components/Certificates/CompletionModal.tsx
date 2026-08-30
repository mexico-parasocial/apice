import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface CompletionModalProps {
  visible: boolean;
  courseName: string;
  onClose: () => void;
  onDownload: () => void;
}

const PURPLE = "#6B5BCD";
const TEXT_DARK = "#1F1B2E";

export default function CompletionModal({
  visible,
  courseName,
  onClose,
  onDownload,
}: CompletionModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          { backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(245,245,247,0.97)" },
        ]}
      >
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Ionicons
            name="close"
            size={36}
            color={isDark ? "#FFFFFF" : "#C4C4C4"}
          />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.congrats,
              { color: isDark ? "#FFFFFF" : TEXT_DARK },
            ]}
          >
            ¡Felicidades!
          </Text>

          <Text
            style={[
              styles.message,
              { color: isDark ? "#E5E5E5" : TEXT_DARK },
            ]}
          >
            Has concluido el módulo de{" "}
            <Text style={[styles.highlight, { color: PURPLE }]}>
              {courseName}
            </Text>
            . Recuerda: este es un pequeño paso para ti, pero un gran salto para
            la comunidad que estamos construyendo. ¡Bienvenido/a a la
            trinchera!
          </Text>
        </ScrollView>

        <TouchableOpacity
          style={styles.downloadButton}
          onPress={onDownload}
          activeOpacity={0.8}
        >
          <Ionicons name="download-outline" size={48} color="#C4C4C4" />
          <Text style={styles.downloadLabel}>Descargar Certificado</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },
  closeButton: {
    position: "absolute",
    top: 56,
    left: 24,
    zIndex: 1,
    padding: 8,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  congrats: {
    fontFamily: "Raleway_700Bold",
    fontSize: 36,
    marginBottom: 32,
    textAlign: "center",
  },
  message: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 24,
    lineHeight: 36,
    textAlign: "center",
  },
  highlight: {
    fontFamily: "Nunito_700Bold",
  },
  downloadButton: {
    alignItems: "center",
    marginTop: 24,
  },
  downloadLabel: {
    marginTop: 8,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: "#C4C4C4",
  },
});
