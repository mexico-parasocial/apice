import React from "react";
import { View, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useRoute,
  RouteProp,
  useNavigation,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  AlfText,
  atoms as a,
  ContentContainer,
  LessonRoad,
  EmptyState,
  ErrorState,
  LoadingState,
  makeCoursesHooks,
  makeCourseProgressHooks,
  makeEnrollmentHooks,
  useTheme,
  type LessonNode,
} from "@apice/mobile";

import { useCourseContent, useCourseProgress, useEnrollmentStatus, useEnroll } from "@/api/hooks";
import { useAuth } from "@/hooks/useAuth";
import { RootStackParamList } from "@/navigation/RootNavigator";

export function CourseDetailScreen() {
  const theme = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, "CourseDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { courseId, courseName } = route.params;
  const { token } = useAuth();

  const {
    data: contentData,
    isLoading: contentLoading,
    error: contentError,
    refetch: refetchContent,
  } = useCourseContent(courseId);

  const {
    data: progressData,
    isLoading: progressLoading,
    error: progressError,
    refetch: refetchProgress,
  } = useCourseProgress(courseId);

  const { data: enrollmentData } = useEnrollmentStatus(courseId, !!token);
  const enroll = useEnroll();

  // No focus-refetch here by design: lesson completion on the player screen
  // invalidates ["course-progress"] from the mutation, and the QueryClient's
  // staleTime covers the rest. Refetching on every focus used to fire 2–4
  // requests each time the learner navigated back.

  const isLoading = contentLoading || progressLoading;
  const error = contentError || progressError;
  const enrolled = enrollmentData?.enrolled ?? false;

  const handleSelectLesson = (lesson: LessonNode) => {
    navigation.navigate("LessonPlayer", {
      courseId,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      courseName,
    });
  };

  const handleEnroll = () => {
    enroll.mutate(
      { courseId },
      {
        onSuccess: () => refetchProgress(),
        onError: (err: any) =>
          alert(err?.response?.data?.message || "Error al inscribirse"),
      }
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
        <LoadingState label="Cargando programa…" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
        <ErrorState
          message={(error as any).message}
          onRetry={() => {
            refetchContent();
            refetchProgress();
          }}
        />
      </SafeAreaView>
    );
  }

  const lessons = progressData?.lessons ?? [];
  const progress = progressData?.progress ?? 0;

  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
      <ScrollView contentContainerStyle={a.pb_2xl}>
        <ContentContainer>
        <View style={[a.px_lg, a.pt_lg, a.pb_sm]}>
          <AlfText variant="heading" color="primary_800">
            {courseName}
          </AlfText>
          {contentData?.course?.description ? (
            <AlfText variant="body" color="contrast_500" style={a.mt_sm}>
              {contentData.course.description}
            </AlfText>
          ) : null}

          {enrolled ? (
            <View style={[a.mt_md]}>
              <AlfText variant="caption" color="positive_500">
                ✓ Inscrito · {progress}% completado
              </AlfText>
            </View>
          ) : token ? (
            <TouchableOpacity
              style={[
                a.mt_md,
                a.rounded_lg,
                a.px_lg,
                a.py_sm,
                { backgroundColor: theme.palette.primary_800, alignSelf: "flex-start" },
              ]}
              onPress={handleEnroll}
              disabled={enroll.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Inscribirme en ${courseName}`}
            >
              <AlfText variant="button" color="white">
                {enroll.isPending ? "Inscribiendo…" : "Inscribirme gratis"}
              </AlfText>
            </TouchableOpacity>
          ) : null}
        </View>

        {lessons.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title="Sin módulos"
            message="Este programa aún no tiene módulos."
          />
        ) : (
          <LessonRoad
            courseId={courseId}
            lessons={lessons}
            progress={progress}
            onSelectLesson={handleSelectLesson}
          />
        )}
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
