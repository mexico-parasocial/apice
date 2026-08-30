import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  AlfText,
  atoms as a,
  useTheme,
  type LessonNode,
  VideoPlayer,
  VideoPlayerSkeleton,
} from "@apice/mobile";
import {
  usePlaybackUrl,
  useReportVideoProgress,
  useMarkVideoComplete,
  useCourseProgress,
} from "@/api/hooks";
import { RootStackParamList } from "@/navigation/RootNavigator";

/** Report progress at most every 15 seconds of playback. */
const PROGRESS_REPORT_INTERVAL_S = 15;

export function LessonPlayerScreen() {
  const theme = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, "LessonPlayer">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { courseId, lessonId, lessonTitle, courseName } = route.params;

  const { data, isLoading, error } = usePlaybackUrl(lessonId);
  const { data: progressData, refetch: refetchProgress } =
    useCourseProgress(courseId);
  const reportProgress = useReportVideoProgress();
  const markComplete = useMarkVideoComplete();
  const [completed, setCompleted] = React.useState(false);
  const lastReportedRef = React.useRef(0);

  // Telemetry lite: startup time, stalls, errors (sent with completion).
  const telemetryRef = React.useRef({
    mountedAt: Date.now(),
    startupMs: undefined as number | undefined,
    stallCount: 0,
    errorCount: 0,
  });

  const handleProgress = React.useCallback(
    (seconds: number) => {
      if (seconds - lastReportedRef.current < PROGRESS_REPORT_INTERVAL_S) {
        return;
      }
      lastReportedRef.current = seconds;
      reportProgress.mutate({
        lessonId,
        watchedSeconds: Math.floor(seconds),
      });
    },
    [lessonId, reportProgress]
  );

  const lessons: LessonNode[] = progressData?.lessons ?? [];
  const currentLessonProgress = lessons.find((l) => l.id === lessonId);
  // Server truth OR-ed with the just-now optimistic flag below — reading an
  // already-completed lesson (e.g. revisiting it) must not fall back to
  // showing "Marcar como completada" just because local state starts false.
  const videoWatched = completed || currentLessonProgress?.completed === true;
  const isCheckpoint = currentLessonProgress?.isCheckpoint ?? false;
  const quizPassed = currentLessonProgress?.quizPassed ?? null;

  // Next available lesson after this one (lesson road order).
  const nextLesson = React.useMemo(() => {
    const currentIndex = lessons.findIndex((l) => l.id === lessonId);
    if (currentIndex < 0) return null;
    return (
      lessons
        .slice(currentIndex + 1)
        .find((l) => l.available || l.completed) ?? null
    );
  }, [lessons, lessonId]);

  const goToNextLesson = () => {
    if (!nextLesson) return;
    navigation.replace("LessonPlayer", {
      courseId,
      lessonId: nextLesson.id,
      lessonTitle: nextLesson.title,
      courseName,
    });
  };

  const handleComplete = React.useCallback(() => {
    if (videoWatched) return;
    setCompleted(true);
    refetchProgress();
    markComplete.mutate({
      lessonId,
      telemetry: {
        startupMs: telemetryRef.current.startupMs,
        stallCount: telemetryRef.current.stallCount,
        errorCount: telemetryRef.current.errorCount,
      },
    });
  }, [videoWatched, lessonId, markComplete, refetchProgress]);

  const isIdentityError =
    (error as any)?.response?.status === 403 ||
    (error as any)?.message?.includes("Bluesky identity");

  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
      {isLoading ? (
        <VideoPlayerSkeleton />
      ) : error ? (
        <View style={styles.videoPlaceholder}>
          <Ionicons
            name={isIdentityError ? "person-circle-outline" : "warning-outline"}
            size={48}
            color="#E91646"
          />
          <Text style={styles.errorText}>
            {isIdentityError
              ? "Necesitas vincular tu identidad de Bluesky (iM8) para ver videos."
              : "No se pudo cargar el video.\n" + (error as Error).message}
          </Text>
        </View>
      ) : data?.playbackUrl ? (
        <>
          {data.resumeSeconds > 0 && (
            <View
              style={[
                styles.resumePill,
                { backgroundColor: theme.palette.primary_50 },
              ]}
            >
              <Ionicons
                name="play-forward-circle-outline"
                size={16}
                color={theme.palette.primary_800}
              />
              <Text
                style={[styles.resumeText, { color: theme.palette.primary_800 }]}
              >
                Continuando desde {Math.floor(data.resumeSeconds / 60)}:
                {String(data.resumeSeconds % 60).padStart(2, "0")}
              </Text>
            </View>
          )}
        <VideoPlayer
          uri={data.playbackUrl}
          title={lessonTitle}
          durationSeconds={data.durationSeconds}
          onProgress={handleProgress}
          onEnd={handleComplete}
          onStartup={(ms) => {
            telemetryRef.current.startupMs = ms;
          }}
          onStall={() => {
            telemetryRef.current.stallCount += 1;
          }}
          onPlaybackError={() => {
            telemetryRef.current.errorCount += 1;
          }}
        />
        </>
      ) : (
        <View style={styles.videoPlaceholder}>
          <Text style={styles.errorText}>URL de reproducción no disponible.</Text>
        </View>
      )}

      <View style={styles.body}>
        <AlfText variant="caption" color="contrast_500">
          {courseName}
        </AlfText>
        <AlfText variant="title" color="primary_800" style={a.mt_xs}>
          {lessonTitle}
        </AlfText>

        {data?.identity?.blueskyDid && (
          <View style={styles.identityPill}>
            <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
            <Text style={styles.identityText}>Identidad verificada</Text>
          </View>
        )}


        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: theme.palette.primary_800 },
              videoWatched && styles.completedButton,
            ]}
            activeOpacity={0.8}
            onPress={handleComplete}
            disabled={videoWatched}
            accessibilityRole="button"
            accessibilityLabel={
              videoWatched ? "Lección completada" : "Marcar lección como completada"
            }
          >
            <Text style={styles.actionText}>
              {videoWatched ? "✓ Lección completada" : "Marcar como completada"}
            </Text>
          </TouchableOpacity>

          {/* Only checkpoint lessons have a quiz — showing this unconditionally
              404s for every other lesson. */}
          {isCheckpoint && (
            <>
              {videoWatched && quizPassed !== true && (
                <Text style={styles.quizHint}>
                  Aprueba el cuestionario para desbloquear la siguiente lección.
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  {
                    // Brand gold — matches LessonRoad's "quiz pending" node color.
                    backgroundColor:
                      quizPassed === true ? theme.palette.positive_500 : "#D4AF37",
                  },
                ]}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate("Quiz", { lessonId, courseId })
                }
                accessibilityRole="button"
                accessibilityLabel={
                  quizPassed === true
                    ? "Repasar cuestionario de la lección"
                    : "Tomar cuestionario de la lección"
                }
              >
                <Text style={styles.actionText}>
                  {quizPassed === true
                    ? "✓ Cuestionario aprobado"
                    : "Tomar cuestionario"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {nextLesson && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: theme.palette.positive_500 },
              ]}
              activeOpacity={0.8}
              onPress={goToNextLesson}
              accessibilityRole="button"
              accessibilityLabel={`Siguiente lección: ${nextLesson.title}`}
            >
              <Text style={styles.actionText}>
                Siguiente: {nextLesson.title} →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  videoPlaceholder: {
    aspectRatio: 16 / 9,
    backgroundColor: "#F4F4F4",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    marginTop: 12,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: "#E91646",
    textAlign: "center",
  },
  body: {
    flex: 1,
    padding: 16,
  },
  resumePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginLeft: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  resumeText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 12,
  },
  identityPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  identityText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: "#2E7D32",
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    backgroundColor: "#4A1052",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  completedButton: {
    backgroundColor: "#2E7D32",
  },
  actionText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  quizHint: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: "#8A6D1A",
    marginTop: -4,
  },
});
