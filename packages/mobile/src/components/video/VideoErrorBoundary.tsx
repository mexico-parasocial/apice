import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  retryKey: number;
}

/**
 * Error boundary with retry (Bluesky's VideoEmbed pattern): a crashing
 * player shows a retry card instead of killing the whole screen.
 */
export class VideoErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  retry = () => {
    this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>No se pudo reproducir el video</Text>
          <Text style={styles.message} numberOfLines={2}>
            {this.state.error.message}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.retry}
            accessibilityRole="button"
            accessibilityLabel="Reintentar reproducción"
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#1F2937",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
    marginBottom: 6,
    textAlign: "center",
  },
  message: {
    color: "#9CA3AF",
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#4A1052",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
  },
});
