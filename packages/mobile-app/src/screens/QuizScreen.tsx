import React, { useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlfText,
  atoms as a,
  makeCourseProgressHooks,
  useTheme,
  type QuizQuestion,
} from "@apice/mobile";
import { useQuiz, useSubmitQuiz } from "@/api/hooks";
import { RootStackParamList } from "@/navigation/RootNavigator";

export function QuizScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<RootStackParamList, "Quiz">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lessonId, courseId } = route.params;

  const { data, isLoading, error } = useQuiz(lessonId);
  const submitQuiz = useSubmitQuiz();

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{
    passed: boolean;
    score: number;
    correctCount: number;
    total: number;
  } | null>(null);

  const questions: QuizQuestion[] = data?.quiz?.questions ?? [];
  const allAnswered =
    questions.length > 0 &&
    questions.every((_, i) => answers[i] !== undefined);

  const handleSubmit = () => {
    const payload = questions.map((_, i) => answers[i]);
    submitQuiz.mutate(
      { lessonId, answers: payload },
      {
        onSuccess: (res) => {
          setResult(res);
          // Checkpoint-gating depends on this — refresh the lesson road.
          queryClient.invalidateQueries({
            queryKey: ["course-progress", courseId],
          });
        },
        onError: (err: any) => {
          alert(err?.response?.data?.message || "Error al enviar");
        },
      }
    );
  };

  // ─── Result state ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
        <View style={styles.resultContainer}>
          <Ionicons
            name={result.passed ? "checkmark-circle" : "close-circle"}
            size={72}
            color={result.passed ? "#2E7D32" : "#E91646"}
          />
          <AlfText variant="heading" style={a.mt_lg}>
            {result.passed ? "¡Aprobado!" : "Sigue practicando"}
          </AlfText>
          <AlfText variant="body" color="contrast_500" style={a.mt_sm}>
            {result.correctCount} de {result.total} correctas · {result.score}%
          </AlfText>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.palette.primary_800 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Volver al programa"
          >
            <AlfText variant="button" color="white">
              Volver al programa
            </AlfText>
          </TouchableOpacity>
          {!result.passed && (
            <TouchableOpacity
              style={a.mt_md}
              onPress={() => {
                setResult(null);
                setAnswers({});
              }}
              accessibilityRole="button"
              accessibilityLabel="Intentar de nuevo"
            >
              <AlfText variant="button" color="primary_800">
                Intentar de nuevo
              </AlfText>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ─── Loading / error / empty states ───────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.palette.primary_800} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || questions.length === 0) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
        <View style={styles.centered}>
          <AlfText variant="title">Sin cuestionario</AlfText>
          <AlfText variant="body" color="contrast_500" style={a.mt_sm}>
            Esta lección no tiene cuestionario.
          </AlfText>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Quiz form ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {questions.map((question, qIndex) => (
          <View
            key={qIndex}
            style={[theme.atoms.bg_contrast_25, a.rounded_xl, a.p_lg, a.mb_md]}
          >
            <AlfText variant="title">
              {qIndex + 1}. {question.text}
            </AlfText>
            <View style={[a.mt_md, a.gap_sm]}>
              {question.options.map((option, oIndex) => {
                const selected = answers[qIndex] === oIndex;
                return (
                  <TouchableOpacity
                    key={oIndex}
                    style={[
                      styles.option,
                      {
                        borderColor: selected
                          ? theme.palette.primary_800
                          : theme.palette.contrast_200,
                        backgroundColor: selected
                          ? theme.palette.primary_50
                          : "transparent",
                      },
                    ]}
                    onPress={() =>
                      setAnswers((prev) => ({ ...prev, [qIndex]: oIndex }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Opción ${oIndex + 1}: ${option}`}
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={selected ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={
                        selected
                          ? theme.palette.primary_800
                          : theme.palette.contrast_400
                      }
                    />
                    <AlfText variant="body" style={a.ml_sm}>
                      {option}
                    </AlfText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: theme.palette.primary_800 },
            (!allAnswered || submitQuiz.isPending) && styles.buttonDisabled,
          ]}
          disabled={!allAnswered || submitQuiz.isPending}
          onPress={handleSubmit}
          accessibilityRole="button"
          accessibilityLabel="Enviar cuestionario"
        >
          {submitQuiz.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <AlfText variant="button" color="white">
              Enviar respuestas
            </AlfText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resultContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
});
