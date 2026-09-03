import React from "react";
import {
  View,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlfText,
  atoms as a,
  ErrorState,
  LoadingState,
  useTheme,
} from "@apice/mobile";
import { useCourses, useEnroll } from "@/api/hooks";
import { useAuth } from "@/hooks/useAuth";
import { RootStackParamList } from "@/navigation/RootNavigator";

/**
 * One catalogue row, memoized. The old inline renderItem built a fresh
 * closure tree per render, so every `enrolling` state change re-rendered
 * the entire list.
 */
const CourseRow = React.memo(function CourseRow({
  item,
  token,
  enrolling,
  onOpen,
  onEnroll,
}: {
  item: any;
  token: string | null;
  enrolling: string | null;
  onOpen: (course: { id: string; name: string }) => void;
  onEnroll: (courseId: string, courseName: string) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        theme.atoms.bg_contrast_25,
        a.rounded_xl,
        a.p_lg,
        a.mb_md,
        a.mx_lg,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onOpen({ id: item.id, name: item.name })}
        accessibilityRole="button"
        accessibilityLabel={`Abrir programa ${item.name}`}
      >
        <AlfText variant="title">{item.name}</AlfText>
        <AlfText variant="body" color="contrast_500" style={a.mt_xs}>
          {item.categories} · {item.level}
        </AlfText>
        <AlfText variant="button" color="primary_800" style={a.mt_sm}>
          {item.price === 0 ? "Gratis" : `$${item.price}`}
        </AlfText>
      </TouchableOpacity>
      {token && (
        <TouchableOpacity
          style={[
            { backgroundColor: theme.palette.primary_800 },
            a.rounded_lg,
            a.px_lg,
            a.py_sm,
            a.mt_md,
            { alignSelf: "flex-start" },
          ]}
          onPress={() => onEnroll(item.id, item.name)}
          disabled={enrolling === item.id}
          accessibilityRole="button"
          accessibilityLabel={`Inscribirme en ${item.name}`}
        >
          <AlfText variant="button" color="white">
            {enrolling === item.id ? "Inscribiendo..." : "Inscribirme"}
          </AlfText>
        </TouchableOpacity>
      )}
    </View>
  );
});

export function CoursesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { data, isLoading, error, refetch } = useCourses();
  const [enrolling, setEnrolling] = React.useState<string | null>(null);

  // The shared mutation (invalidates enrollment + progress caches); the raw
  // axios call it replaces left those stale after enrolling from this tab.
  const enroll = useEnroll();

  const handleEnroll = React.useCallback(
    (courseId: string, courseName: string) => {
      if (!token) return;
      setEnrolling(courseId);
      enroll.mutate(
        { courseId },
        {
          onSuccess: () => {
            alert(`Inscrito correctamente en ${courseName}`);
            // Enrollment state can colour rows in the catalogue.
            queryClient.invalidateQueries({ queryKey: ["courses"] });
            queryClient.invalidateQueries({ queryKey: ["all-progress"] });
          },
          onError: (err: any) => {
            alert(err?.response?.data?.message || "Error al inscribirse");
          },
          onSettled: () => setEnrolling(null),
        }
      );
    },
    [token, enroll, queryClient]
  );

  const openCourse = React.useCallback(
    (course: { id: string; name: string }) => {
      // The catalogue opens the preview (info + benefits + curriculum);
      // CourseDetail — the lesson road — is one tap further, from there.
      navigation.navigate("CoursePreview", {
        courseId: course.id,
        courseName: course.name,
      });
    },
    [navigation]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: any }) => (
      <CourseRow
        item={item}
        token={token}
        enrolling={enrolling}
        onOpen={openCourse}
        onEnroll={handleEnroll}
      />
    ),
    [token, enrolling, openCourse, handleEnroll]
  );

  return (
    <SafeAreaView style={[a.flex_1, theme.atoms.bg]} edges={["top"]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <AlfText variant="heading" color="primary_800" style={[a.mx_lg, a.my_lg]}>
        Programas
      </AlfText>
      {isLoading ? (
        <LoadingState label="Cargando programas…" />
      ) : error ? (
        <ErrorState
          message={(error as any).message}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={data?.courses ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={a.pb_xl}
        />
      )}
    </SafeAreaView>
  );
}
