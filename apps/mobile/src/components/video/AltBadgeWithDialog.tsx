import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from "react-native";

/**
 * ALT badge on the player; tapping opens a dialog with the video's
 * description/alt text (Bluesky's AltBadgeWithDialog pattern, simplified).
 */
export function AltBadgeWithDialog({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.badge}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Ver descripción del video"
      >
        <Text style={styles.badgeText}>ALT</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <ScrollView style={styles.dialogScroll}>
              <Text style={styles.dialogText}>{text}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar descripción"
            >
              <Text style={styles.closeText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    left: 8,
    top: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Nunito_700Bold",
    letterSpacing: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    padding: 32,
  },
  dialog: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    maxHeight: "70%",
  },
  dialogScroll: {
    flexGrow: 0,
  },
  dialogText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },
  closeButton: {
    marginTop: 16,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#4A1052",
    borderRadius: 10,
  },
  closeText: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
  },
});
