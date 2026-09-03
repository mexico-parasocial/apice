import React from "react";
import { View, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
  AlfText,
  atoms as a,
  ContentContainer,
  ErrorState,
  LoadingState,
  OptativeCourseCard,
  OptativeHomeSection,
  makeCoursesHooks,
  useTheme,
  type CourseSummary,
} from "@apice/mobile";
import { api } from "@/api/client";
import { useCourses } from "@/api/hooks";
import { useAuth } from "@/hooks/useAuth";
import { RootStackParamList } from "@/navigation/RootNavigator";

interface EnrollmentSummary {
  progress: number;
  completed: boolean;
  lastAccessedAt: string | null;
  course: { id: string; name: string };
}

/**
 * One program row, memoized: `openCourse` is a useCallback and the course
 * objects come straight from query data, so rows only re-render when the
 * list itself changes — not on every parent state tick.
 */
const ProgramRow = React.memo(function ProgramRow({
  course,
  onOpen,
}: {
  course: CourseSummary;
  onOpen: (course: { id: string; name: string }) => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onOpen(course)}
      accessibilityRole="button"
      accessibilityLabel={`Abrir programa ${course.name}`}
      style={[
        theme.atoms.bg_contrast_25,
        a.rounded_xl,
        a.p_lg,
        a.mx_lg,
        a.mb_sm,
        a.flex_row,
        { alignItems: "center", gap: 12 },
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: theme.palette.primary_800,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="school" size={20} color="#FFFFFF" />
      </View>
      <View style={a.flex_1}>
        <AlfText variant="title" numberOfLines={2}>
          {course.name}
        </AlfText>
        <AlfText variant="caption" color="contrast_500" style={a.mt_xs}>
          {course.level}
        </AlfText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.palette.contrast_400}
      />
    </TouchableOpacity>
  );
});

export function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, token } = useAuth();
  const { data, isLoading, error, refetch } = useCourses();

  // Most recently touched in-progress enrollment → the "continue" card.
  const { data: progressData } = useQuery({
    queryKey: ["all-progress"],
    queryFn: async () => {
      const res = await api.get("/get-all-progress");
      return res.data;
    },
    enabled: !!token,
  });

  const continueEnrollment: EnrollmentSummary | null = React.useMemo(() => {
    const enrollments: EnrollmentSummary[] = progressData?.enrollments ?? [];
    // Endpoint already orders by lastAccessedAt desc.
    return (
      enrollments.find((e) => e.progress > 0 && !e.completed) ?? null
    );
  }, [progressData]);

  const troncales =
    data?.courses.filter((c: CourseSummary) => c.categories !== "Optativo") ?? [];
  const optatives =
    data?.courses.filter((c: CourseSummary) => c.categories === "Optativo") ?? [];

  const firstName = user?.name?.split(" ")[0];

  // The continue card resumes the road directly — the learner already chose
  // this programme. Discovery surfaces (optativos) go through the preview.
  const openCourse = React.useCallback(
    (course: { id: string; name: string }) => {
      navigation.navigate("CourseDetail", {
        courseId: course.id,
        courseName: course.name,
      });
    },
    [navigation]
  );

  const previewCourse = React.useCallback(
    (course: { id: string; name: string }) => {
      navigation.navigate("CoursePreview", {
        courseId: course.id,
        courseName: course.name,
      });
    },
    [navigation]
  );

  // Everything above the program list is header content for the FlatList —
  // the list itself stays virtualized no matter how many programs exist.
  const header = (
    <ContentContainer>
      <View style={[a.mx_lg, a.mt_lg, a.mb_md]}>
        <AlfText variant="wordmark" color="primary_800">
          Ápice
        </AlfText>
        <AlfText variant="body" color="contrast_600" style={a.mt_xs}>
          {firstName
            ? `Hola, ${firstName} — sigue construyendo ciudadanía.`
            : "Aprende, participa y construye ciudadanía."}
        </AlfText>
      </View>

      {isLoading && <LoadingState label="Cargando…" />}
      {error && (
        <ErrorState
          message={(error as any).message}
          onRetry={() => refetch()}
        />
      )}

      {continueEnrollment && (
        <View style={a.mb_sm}>
          <AlfText
            variant="title"
            color="primary_800"
            style={[a.mx_lg, a.mb_xs]}
          >
            Continuar aprendiendo
          </AlfText>
          <OptativeCourseCard
            title={continueEnrollment.course.name}
            subtitle={`${continueEnrollment.progress}% completado`}
            progress={continueEnrollment.progress}
            onPress={() => openCourse(continueEnrollment.course)}
          />
        </View>
      )}

      {troncales.length > 0 && (
        <AlfText
          variant="title"
          color="primary_800"
          style={[a.mx_lg, a.mb_xs, a.mt_sm]}
        >
          Programas
        </AlfText>
      )}
    </ContentContainer>
  );

  const footer =
    optatives.length > 0 ? (
    <ContentContainer>
      <AlfText
        variant="title"
        color="primary_800"
        style={[a.mx_lg, a.mt_sm]}
      >
        Optativos
      </AlfText>
      <OptativeHomeSection
        courses={optatives.map((c: CourseSummary) => ({
          id: c.id,
          name: c.name,
          progress: 0,
        }))}
        // The continue card already anchors the top of the feed; a second
        // hero card for electives would compete with it.
        showFeatured={!continueEnrollment}
        onSelectCourse={(course) => previewCourse(course)}
      />
    </ContentContainer>
    ) : null;

  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <FlatList
        data={troncales}
        keyExtractor={(course) => course.id}
        renderItem={({ item }) => (
          <ProgramRow course={item} onOpen={openCourse} />
        )}
        contentContainerStyle={a.pb_2xl}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
      />
    </SafeAreaView>
  );
}
