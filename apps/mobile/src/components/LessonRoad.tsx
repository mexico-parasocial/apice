import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { LessonNode } from "../hooks/useCourseProgress";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  buildRoadModel,
  fullPathD,
  isSegmentDone,
  type RoadModel,
  type RoadNodeLayout,
} from "./LessonRoad.geometry";

interface LessonRoadProps {
  courseId: string;
  lessons: LessonNode[];
  progress: number;
  activeLessonId?: string;
  onSelectLesson?: (lesson: LessonNode) => void;
  updateLesson?: UseMutationResult<
    any,
    unknown,
    { courseId: string; lessonId: string; completed?: boolean; watchedSeconds?: number },
    unknown
  >;
}

type NodeRow = LessonNode & { layout: RoadNodeLayout; index: number };

/** Key insight vs. the previous version: the road (SVG) and the nodes
 *  (FlatList rows) both position themselves from ONE geometry model, in the
 *  same content coordinate space. Node centers land exactly on the path
 *  because both are derived from `model.nodes[i]` — alignment by
 *  construction, not by eyeballing two layouts into agreement. */
export default function LessonRoad({
  courseId,
  lessons,
  progress,
  activeLessonId,
  onSelectLesson,
  updateLesson,
}: LessonRoadProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const update = updateLesson;

  const [containerWidth, setContainerWidth] = React.useState(0);

  const model: RoadModel = useMemo(
    () => buildRoadModel(containerWidth, lessons.length),
    [containerWidth, lessons.length]
  );

  const colors = useMemo(
    () => ({
      roadBase: isDark ? "#2A1233" : "#EBDEF2",
      roadDone: isDark ? "#A658BB" : "#8C3AA0",
      bg: isDark ? "#0D0D0D" : "#FFFFFF",
      text: isDark ? "#F5F5F5" : "#1A1A1A",
      muted: isDark ? "#9A9A9A" : "#6B6B6B",
      nodeSurface: isDark ? "#1A1A1A" : "#FFFFFF",
      done: "#22C55E",
      quiz: "#D4AF37",
      locked: isDark ? "#3A3A3A" : "#C9C9C9",
      available: "#8C3AA0",
      lockIcon: isDark ? "#777" : "#9A9A9A",
      goalIdle: isDark ? "#3A3A3A" : "#D9D2DE",
      goalDone: "#D4AF37",
    }),
    [isDark]
  );

  const rows: NodeRow[] = useMemo(
    () => lessons.map((lesson, index) => ({ ...lesson, index, layout: model.nodes[index] })),
    [lessons, model]
  );

  const doneCount = useMemo(() => lessons.filter((l) => l.completed).length, [lessons]);

  const handleNodePress = useCallback(
    (lesson: LessonNode) => {
      if (!lesson.available) return;
      onSelectLesson?.(lesson);
    },
    [onSelectLesson]
  );

  const handleComplete = useCallback(
    (lesson: LessonNode) => {
      if (!lesson.available || lesson.completed) return;
      update?.mutate({
        courseId,
        lessonId: lesson.id,
        completed: true,
      });
    },
    [courseId, update]
  );

  const renderItem = useCallback(
    ({ item }: { item: NodeRow }) => {
      const { layout, index } = item;
      const isActive = activeLessonId === item.id;
      const isLocked = !item.available;
      const quizPending = item.isCheckpoint && item.completed && item.quizPassed !== true;
      const isCompleted = item.completed && (!item.isCheckpoint || item.quizPassed === true);

      const accent = isCompleted
        ? colors.done
        : quizPending
        ? colors.quiz
        : isLocked
        ? colors.locked
        : colors.available;

      const icon = isCompleted ? "checkmark" : quizPending ? "help-circle" : isLocked ? "lock-closed" : "play";
      const stateLabel = isCompleted
        ? "completada"
        : quizPending
        ? "cuestionario pendiente"
        : isLocked
        ? "bloqueada"
        : "disponible";

      const node = (
        <View style={[styles.nodeShell, { width: model.nodeSize, height: model.nodeSize }]}>
          <TouchableOpacity
            activeOpacity={isLocked ? 1 : 0.7}
            onPress={() => handleNodePress(item)}
            style={[
              styles.node,
              { borderColor: accent, backgroundColor: colors.nodeSurface },
              isActive && styles.nodeActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Lección ${index + 1} de ${rows.length}: ${item.title}, ${stateLabel}`}
            accessibilityState={{ disabled: isLocked }}
          >
            <View style={[styles.nodeInner, { backgroundColor: accent }]}>
              <Ionicons
                name={icon as any}
                size={24}
                color={isLocked ? colors.lockIcon : "#FFFFFF"}
              />
            </View>
            {item.isCheckpoint && (
              <View style={[styles.badge, styles.badgeQuiz, { backgroundColor: colors.quiz, borderColor: colors.nodeSurface }]}>
                <Ionicons name="ribbon" size={10} color="#FFFFFF" />
              </View>
            )}
            <View style={[styles.badge, styles.badgeNumber, { backgroundColor: colors.nodeSurface, borderColor: colors.nodeSurface }]}>
              <Text style={[styles.badgeNumberText, { color: colors.muted }]}>{index + 1}</Text>
            </View>
          </TouchableOpacity>
        </View>
      );

      const label = (
        <View
          style={[
            styles.label,
            {
              left: layout.labelLeft,
              width: layout.labelWidth,
              top: model.mode === "compact" ? layout.labelTop : 0,
              bottom: model.mode === "compact" ? undefined : 0,
              alignItems: model.mode === "compact" ? "center" : "flex-start",
            },
          ]}
        >
          <Text
            style={[
              styles.title,
              { color: isLocked ? colors.muted : colors.text },
              model.mode === "side" && {
                textAlign: layout.side === "right" ? "right" : "left",
              },
            ]}
            numberOfLines={model.mode === "compact" ? 2 : 3}
          >
            {item.title}
          </Text>
          <Text
            style={[
              styles.meta,
              { color: colors.muted },
              model.mode === "side" && { textAlign: layout.side === "right" ? "right" : "left" },
            ]}
            numberOfLines={1}
          >
            {item.sectionTitle}
            {item.videoLength ? ` · ${formatTime(item.videoLength)}` : ""}
          </Text>
          {quizPending && (
            <Text style={[styles.quizNote, { color: colors.quiz }]}>Cuestionario pendiente</Text>
          )}
          {!item.completed && !isLocked && (
            <TouchableOpacity
              onPress={() => handleComplete(item)}
              style={[styles.completeButton, { backgroundColor: colors.done }]}
              accessibilityRole="button"
              accessibilityLabel={`Marcar ${item.title} como completada`}
            >
              <Text style={styles.completeText}>Hecho</Text>
            </TouchableOpacity>
          )}
        </View>
      );

      return (
        <View style={[styles.row, { height: model.rowHeight }]}>
          <View
            style={[
              styles.nodeShell,
              { left: layout.x - model.nodeSize / 2, width: model.nodeSize },
            ]}
          >
            {node}
          </View>
          {label}
        </View>
      );
    },
    [activeLessonId, colors, model, handleNodePress, handleComplete, rows.length]
  );

  const goalDone = lessons.length > 0 && doneCount === lessons.length;

  if (lessons.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Este programa aún no tiene módulos.</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bg }]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>
            Progreso del programa
          </Text>
          <Text style={[styles.progressCount, { color: colors.text }]}>
            {doneCount} de {lessons.length} lecciones
          </Text>
        </View>
        <Text style={[styles.progressValue, { color: colors.roadDone }]}>
          {progress}%
        </Text>
      </View>

      {/* The scrollable owns the road overlay too: the SVG and the rows live
          in the same scrolling container, so the road can never drift from
          the nodes while scrolling (this was the original misalignment bug).
          Plain mapped rows, not a virtualized list: courses are small, and a
          virtualized list here both warned about ScrollView nesting and
          scrolled its rows away from the absolutely-positioned road. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`}>
            {/* Base road */}
            <Path
              d={fullPathD(model)}
              fill="none"
              stroke={colors.roadBase}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Completed stretches drawn over the base */}
            {model.segments.map((segment, i) =>
              isSegmentDone(lessons, segment.to) ? (
                <Path
                  key={i}
                  d={segment.d}
                  fill="none"
                  stroke={colors.roadDone}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null
            )}
          </Svg>
        </View>

        {rows.map((row) => (
          <React.Fragment key={row.id}>{renderItem({ item: row })}</React.Fragment>
        ))}

        <View style={{ height: model.height - rows.length * model.rowHeight }}>
          <View
            style={[
              styles.goal,
              {
                top:
                  model.goal.y -
                  rows.length * model.rowHeight -
                  model.nodeSize / 2,
                left: model.goal.x - model.nodeSize / 2,
                width: model.nodeSize,
                height: model.nodeSize,
                borderColor: goalDone ? colors.goalDone : colors.goalIdle,
              },
            ]}
            accessibilityRole="image"
            accessibilityLabel={
              goalDone ? "Programa completado" : "Meta del programa"
            }
          >
            <View
              style={[
                styles.goalInner,
                { backgroundColor: goalDone ? colors.goalDone : colors.goalIdle },
              ]}
            >
              <Ionicons name="trophy" size={22} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  progressLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 15,
  },
  progressCount: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  progressValue: {
    fontFamily: "Raleway_700Bold",
    fontSize: 28,
  },
  row: {
    position: "relative",
  },
  nodeShell: {
    position: "absolute",
    top: 0,
    bottom: 0,
    // Vertically centered: geometry places node centers at rowHeight / 2.
    justifyContent: "center",
    alignItems: "center",
  },
  node: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  nodeActive: {
    transform: [{ scale: 1.08 }],
  },
  nodeInner: {
    width: "76%",
    height: "76%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeQuiz: {
    top: -3,
    right: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeNumber: {
    bottom: -2,
    left: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeNumberText: {
    fontFamily: "Raleway_700Bold",
    fontSize: 10,
  },
  label: {
    position: "absolute",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Raleway_700Bold",
    fontSize: 13,
    lineHeight: 17,
  },
  meta: {
    fontFamily: "Nunito_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  quizNote: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 11,
    marginTop: 3,
  },
  completeButton: {
    marginTop: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  completeText: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 10,
  },
  goal: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  goalInner: {
    width: "76%",
    height: "76%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
