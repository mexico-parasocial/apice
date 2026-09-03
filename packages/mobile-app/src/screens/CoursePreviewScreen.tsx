import React from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import {
  AlfText,
  atoms as a,
  ContentContainer,
  ErrorState,
  LoadingState,
  useTheme,
  type CourseLesson,
} from "@apice/mobile";
import { useCourse } from "@/api/hooks";
import { RootStackParamList } from "@/navigation/RootNavigator";

function formatTime(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/**
 * Store-listing style screen for a programme: everything a learner needs to
 * decide before opening the course road — description, benefits,
 * prerequisites, curriculum size and social proof. The action buttons hand
 * off to CourseDetail, which stays the learning surface (road + player).
 */
export function CoursePreviewScreen() {
  const theme = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, "CoursePreview">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { courseId, courseName } = route.params;

  const { data, isLoading, error, refetch } = useCourse(courseId);
  const course = data?.course;

  const lessons: CourseLesson[] = course?.courseData ?? [];
  const totalSeconds = lessons.reduce(
    (sum: number, l) => sum + (l.videoLength ?? 0),
    0
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["bottom"]}>
        <LoadingState label="Cargando programa…" />
      </SafeAreaView>
    );
  }

  if (error || !course) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["bottom"]}>
        <ErrorState
          message={(error as any)?.message ?? "Programa no encontrado"}
          onRetry={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const priceLabel = course.price === 0 ? "Gratis" : `$${course.price}`;
  const stats: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    {
      icon: "star",
      label: course.ratings > 0 ? course.ratings.toFixed(1) : "Nuevo",
    },
    { icon: "people", label: `${course.purchased} inscritos` },
    { icon: "play-circle", label: `${lessons.length} lecciones` },
    ...(totalSeconds > 0
      ? [{ icon: "time" as const, label: formatTime(totalSeconds) }]
      : []),
  ];

  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <ContentContainer>
          {course.thumbnail?.url ? (
            <Image
              source={{ uri: course.thumbnail.url }}
              style={styles.hero}
              accessibilityLabel={`Portada de ${course.name}`}
            />
          ) : null}

          <View style={a.px_lg}>
            <View style={styles.chipRow}>
              {/* categories and level are often the same in seed data — dedupe */}
              {[...new Set([course.categories, course.level].filter(Boolean))].map(
                (label) => (
                  <View
                    key={label}
                    style={[
                      styles.chip,
                      { backgroundColor: theme.palette.primary_50 },
                    ]}
                  >
                    <AlfText variant="caption" color="primary_800">
                      {label}
                    </AlfText>
                  </View>
                )
              )}
              <View style={[styles.chip, { backgroundColor: colors.chipPrice }]}>
                <AlfText variant="caption" color="primary_800">
                  {priceLabel}
                </AlfText>
              </View>
            </View>

            <AlfText variant="heading" color="primary_800" style={a.mt_sm}>
              {course.name}
            </AlfText>
            {course.description ? (
              <AlfText variant="body" color="contrast_500" style={a.mt_sm}>
                {course.description}
              </AlfText>
            ) : null}

            <View style={styles.statsRow}>
              {stats.map((stat) => (
                <View key={stat.label} style={styles.stat}>
                  <Ionicons
                    name={stat.icon}
                    size={14}
                    color={theme.palette.primary_800}
                  />
                  <Text style={[styles.statLabel, { color: theme.palette.contrast_500 }]}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>

            {course.benefits?.length > 0 && (
              <>
                <AlfText variant="title" color="primary_800" style={a.mt_lg}>
                  Lo que aprenderás
                </AlfText>
                {course.benefits.map((benefit: { title: string }, i: number) => (
                  <View key={i} style={styles.listRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.palette.positive_500}
                    />
                    <AlfText variant="body" color="contrast_600" style={a.flex_1}>
                      {benefit.title}
                    </AlfText>
                  </View>
                ))}
              </>
            )}

            {course.prerequisites?.length > 0 && (
              <>
                <AlfText variant="title" color="primary_800" style={a.mt_lg}>
                  Requisitos
                </AlfText>
                {course.prerequisites.map((req: { title: string }, i: number) => (
                  <View key={i} style={styles.listRow}>
                    <Ionicons
                      name="arrow-forward-circle"
                      size={16}
                      color={theme.palette.contrast_400}
                    />
                    <AlfText variant="body" color="contrast_600" style={a.flex_1}>
                      {req.title}
                    </AlfText>
                  </View>
                ))}
              </>
            )}

            {lessons.length > 0 && (
              <>
                <AlfText variant="title" color="primary_800" style={a.mt_lg}>
                  Contenido del programa
                </AlfText>
                {lessons.slice(0, 8).map((lesson, i) => (
                  <View key={lesson.id ?? i} style={styles.listRow}>
                    <Ionicons
                      name="play-circle"
                      size={16}
                      color={theme.palette.primary_800}
                    />
                    <AlfText variant="body" color="contrast_600" style={a.flex_1} numberOfLines={1}>
                      {i + 1}. {lesson.title}
                    </AlfText>
                    {lesson.videoLength ? (
                      <Text
                        style={[styles.meta, { color: theme.palette.contrast_500 }]}
                      >
                        {formatTime(lesson.videoLength)}
                      </Text>
                    ) : null}
                  </View>
                ))}
                {lessons.length > 8 && (
                  <AlfText variant="caption" color="contrast_500" style={a.mt_xs}>
                    …y {lessons.length - 8} lecciones más dentro del programa.
                  </AlfText>
                )}
              </>
            )}

            <TouchableOpacity
              style={[
                styles.cta,
                { backgroundColor: theme.palette.primary_800 },
              ]}
              activeOpacity={0.8}
              onPress={() =>
                navigation.replace("CourseDetail", { courseId, courseName })
              }
              accessibilityRole="button"
              accessibilityLabel={`Entrar al programa ${course.name}`}
            >
              <AlfText variant="button" color="white">
                Entrar al programa
              </AlfText>
            </TouchableOpacity>
          </View>
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  chipPrice: "#F3E8C8",
};

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    height: 200,
    backgroundColor: "#E9E4EC",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -20,
  },
  chip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 12,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
  },
  meta: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
  },
  cta: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
});
