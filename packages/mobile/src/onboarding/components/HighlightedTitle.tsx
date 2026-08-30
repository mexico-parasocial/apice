import { Text, StyleSheet } from "react-native";
import { useOnboardingTheme } from "../theme-context";

interface HighlightedTitleProps {
  children: string;
  highlights?: string[];
}

export default function HighlightedTitle({
  children,
  highlights = [],
}: HighlightedTitleProps) {
  const { tokens } = useOnboardingTheme();

  const parts: { text: string; highlight: boolean }[] = [];
  let remaining = children;

  // Simple greedy matcher: find each highlight word in remaining text.
  while (remaining.length > 0) {
    let earliestIndex = -1;
    let earliestWord = "";
    for (const word of highlights) {
      const idx = remaining.toLowerCase().indexOf(word.toLowerCase());
      if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
        earliestIndex = idx;
        earliestWord = word;
      }
    }

    if (earliestIndex === -1) {
      parts.push({ text: remaining, highlight: false });
      break;
    }

    if (earliestIndex > 0) {
      parts.push({ text: remaining.slice(0, earliestIndex), highlight: false });
    }

    parts.push({
      text: remaining.slice(
        earliestIndex,
        earliestIndex + earliestWord.length
      ),
      highlight: true,
    });
    remaining = remaining.slice(earliestIndex + earliestWord.length);
  }

  return (
    <Text style={[styles.title, { color: tokens.text }]}>
      {parts.map((part, index) => (
        <Text
          key={index}
          style={part.highlight ? { color: tokens.accent } : undefined}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 36,
    marginBottom: 16,
  },
});
