import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { LessonNode } from "../hooks/useCourseProgress";
import type { UseMutationResult } from "@tanstack/react-query";

const PAD = 24;
const ROAD_WIDTH = 8;
const NODE_SIZE = 56;
const ROW_HEIGHT = 140;
const LABEL_GAP = 8;

function roadGeometry(containerWidth: number) {
  const contentWidth = Math.max(240, containerWidth - PAD * 2);
  const centerX = contentWidth / 2;
  const sway = Math.min(72, Math.max(18, contentWidth * 0.09));
  const labelWidth = Math.max(80, centerX - sway - NODE_SIZE / 2 - LABEL_GAP);
  return { contentWidth, centerX, sway, labelWidth };
}

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
  const { contentWidth, centerX, sway, labelWidth } = useMemo(
    () => roadGeometry(containerWidth),
    [containerWidth]
  );

  const colors = useMemo(
    () => ({
      road: isDark ? "#2A082F" : "#F1E3F5",
      roadDone: "#8C3AA0",
      roadAvailable: isDark ? "#A658BB" : "#D4A9E0",
      bg: isDark ? "#0D0D0D" : "#FFFFFF",
      text: isDark ? "#F5F5F5" : "#1A1A1A",
      muted: isDark ? "#9A9A9A" : "#6B6B6B",
      locked: isDark ? "#3A3A3A" : "#D4D4D4",
      nodeAvailable: "#8C3AA0",
      nodeCompleted: "#22C55E",
      nodeLocked: isDark ? "#3A3A3A" : "#D4D4D4",
      nodeQuizPending: "#D4AF37",
      shadow: isDark ? "rgba(140,58,160,0.3)" : "rgba(74,16,82,0.15)",
    }),
    [isDark]
  );

  const nodes = useMemo(() => {
    return lessons.map((lesson, index) => {
      const isRight = index % 2 === 0;
      const x = isRight ? centerX + sway : centerX - sway;
      return { ...lesson, x, index };
    });
  }, [lessons, centerX, sway]);

  const pathD = useMemo(() => {
    if (nodes.length === 0) return "";
    let d = `M ${nodes[0].x} ${ROW_HEIGHT / 2}`;
    for (let i = 1; i < nodes.length; i++) {
      const prevX = nodes[i - 1].x;
      const prevY = (i - 1) * ROW_HEIGHT + ROW_HEIGHT / 2;
      const currX = nodes[i].x;
      const currY = i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const cp1x = prevX;
      const cp1y = prevY + ROW_HEIGHT * 0.5;
      const cp2x = currX;
      const cp2y = currY - ROW_HEIGHT * 0.5;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${currX} ${currY}`;
    }
    return d;
  }, [nodes]);

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

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: LessonNode & { x: number; index: number } }) => {
      const node = item;
      const isActive = activeLessonId === node.id;
      const isLocked = !node.available;
      const videoWatched = node.completed;
      const quizPending = node.isCheckpoint && videoWatched && node.quizPassed !== true;
      const isCompleted = videoWatched && (!node.isCheckpoint || node.quizPassed === true);

      const nodeColor = isCompleted
        ? colors.nodeCompleted
        : quizPending
        ? colors.nodeQuizPending
        : isLocked
        ? colors.nodeLocked
        : colors.nodeAvailable;

      const iconName = isCompleted
        ? "checkmark"
        : quizPending
        ? "help-circle"
        : isLocked
        ? "lock-closed"
        : "play";

      const isRight = node.index % 2 === 0;

      return (
        <View style={styles.row}>
          {/* Left side: node or spacer */}
          <View style={styles.half}>
            {!isRight ? (
              <TouchableOpacity
                activeOpacity={isLocked ? 1 : 0.7}
                onPress={() => handleNodePress(node)}
                style={[
                  styles.node,
                  {
                    backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF",
                    borderColor: nodeColor,
                    shadowColor: isActive ? colors.nodeAvailable : nodeColor,
                  },
                  isActive && styles.nodeActive,
                ]}
              >
                <View
                  style={[
                    styles.inner,
                    {
                      backgroundColor: isCompleted
                        ? colors.nodeCompleted
                        : quizPending
                        ? colors.nodeQuizPending
                        : isLocked
                        ? colors.nodeLocked
                        : colors.nodeAvailable,
                    },
                  ]}
                >
                  <Ionicons
                    name={iconName as any}
                    size={24}
                    color={isLocked ? (isDark ? "#666" : "#999") : "#FFFFFF"}
                  />
                </View>

                {node.isCheckpoint && (
                  <View
                    style={[
                      styles.bossBadge,
                      { backgroundColor: colors.nodeQuizPending, borderColor: isDark ? "#1A1A1A" : "#FFFFFF" },
                    ]}
                  >
                    <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ width: NODE_SIZE }} />
            )}
          </View>

          {/* Right side: label or node */}
          <View style={styles.half}>
            {isRight ? (
              <View style={styles.labelRow}>
                <View style={{ width: labelWidth }}>
                  <Text
                    style={[styles.title, { color: colors.text }, isLocked && { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {node.title}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {node.sectionTitle}
                    {node.videoLength ? ` · ${formatTime(node.videoLength)}` : ""}
                  </Text>
                  {quizPending && (
                    <Text style={[styles.meta, { color: colors.nodeQuizPending }]}>
                      Cuestionario pendiente
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  activeOpacity={isLocked ? 1 : 0.7}
                  onPress={() => handleNodePress(node)}
                  style={[
                    styles.node,
                    {
                      backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF",
                      borderColor: nodeColor,
                      shadowColor: isActive ? colors.nodeAvailable : nodeColor,
                    },
                    isActive && styles.nodeActive,
                  ]}
                >
                  <View
                    style={[
                      styles.inner,
                      {
                        backgroundColor: isCompleted
                          ? colors.nodeCompleted
                          : quizPending
                          ? colors.nodeQuizPending
                          : isLocked
                          ? colors.nodeLocked
                          : colors.nodeAvailable,
                      },
                    ]}
                  >
                    <Ionicons
                      name={iconName as any}
                      size={24}
                      color={isLocked ? (isDark ? "#666" : "#999") : "#FFFFFF"}
                    />
                  </View>

                  {node.isCheckpoint && (
                    <View
                      style={[
                        styles.bossBadge,
                        { backgroundColor: colors.nodeQuizPending, borderColor: isDark ? "#1A1A1A" : "#FFFFFF" },
                      ]}
                    >
                      <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.labelRow}>
                <TouchableOpacity
                  activeOpacity={isLocked ? 1 : 0.7}
                  onPress={() => handleNodePress(node)}
                  style={[
                    styles.node,
                    {
                      backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF",
                      borderColor: nodeColor,
                      shadowColor: isActive ? colors.nodeAvailable : nodeColor,
                    },
                    isActive && styles.nodeActive,
                  ]}
                >
                  <View
                    style={[
                      styles.inner,
                      {
                        backgroundColor: isCompleted
                          ? colors.nodeCompleted
                          : quizPending
                          ? colors.nodeQuizPending
                          : isLocked
                          ? colors.nodeLocked
                          : colors.nodeAvailable,
                      },
                    ]}
                  >
                    <Ionicons
                      name={iconName as any}
                      size={24}
                      color={isLocked ? (isDark ? "#666" : "#999") : "#FFFFFF"}
                    />
                  </View>

                  {node.isCheckpoint && (
                    <View
                      style={[
                        styles.bossBadge,
                        { backgroundColor: colors.nodeQuizPending, borderColor: isDark ? "#1A1A1A" : "#FFFFFF" },
                      ]}
                    >
                      <Ionicons name="ribbon" size={11} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ width: labelWidth }}>
                  <Text
                    style={[styles.title, { color: colors.text }, isLocked && { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {node.title}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {node.sectionTitle}
                    {node.videoLength ? ` · ${formatTime(node.videoLength)}` : ""}
                  </Text>
                  {quizPending && (
                    <Text style={[styles.meta, { color: colors.nodeQuizPending }]}>
                      Cuestionario pendiente
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Complete button below label (both sides) */}
            {!videoWatched && !isLocked && (
              <TouchableOpacity
                onPress={() => handleComplete(node)}
                style={[styles.completeButton, { backgroundColor: colors.nodeCompleted }]}
              >
                <Text style={styles.completeText}>Hecho</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [activeLessonId, colors, isDark, handleNodePress, handleComplete, labelWidth]
  );

  const keyExtractor = useCallback((item: LessonNode & { index: number }) => item.id, []);

  if (lessons.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>
          Este programa aún no tiene módulos.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bg }]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.header}>
        <Text style={[styles.progressLabel, { color: colors.muted }]}>
          Progreso del programa
        </Text>
        <Text style={[styles.progressValue, { color: colors.text }]}>
          {progress}%
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: PAD }}>
        {/* SVG path rendered behind the list as an absolute overlay */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg
            width={contentWidth}
            height={lessons.length * ROW_HEIGHT}
            viewBox={`0 0 ${contentWidth} ${lessons.length * ROW_HEIGHT}`}
            style={{ overflow: "visible" }}
          >
            <Defs>
              <LinearGradient
                id="roadGradient"
                x1="0"
                y1="0"
                x2="0"
                y2={lessons.length * ROW_HEIGHT}
              >
                <Stop offset="0" stopColor={colors.roadDone} />
                <Stop
                  offset={lessons.length === 0 ? 0 : lessons.filter((l) => l.completed).length / lessons.length}
                  stopColor={colors.roadDone}
                />
                <Stop
                  offset={lessons.length === 0 ? 0 : lessons.filter((l) => l.completed).length / lessons.length}
                  stopColor={colors.roadAvailable}
                />
                <Stop offset="1" stopColor={colors.road} />
              </LinearGradient>
            </Defs>
            <Path
              d={pathD}
              fill="none"
              stroke="url(#roadGradient)"
              strokeWidth={ROAD_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>

        <FlatList
          data={nodes}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={6}
        />
      </View>
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
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    paddingTop: 16,
    paddingBottom: 8,
  },
  progressLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 16,
  },
  progressValue: {
    fontFamily: "Raleway_700Bold",
    fontSize: 28,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },
  half: {
    flex: 1,
    alignItems: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: LABEL_GAP,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  nodeActive: {
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.8,
    elevation: 10,
  },
  bossBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    width: NODE_SIZE - 14,
    height: NODE_SIZE - 14,
    borderRadius: (NODE_SIZE - 14) / 2,
    alignItems: "center",
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
  completeButton: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  completeText: {
    color: "#FFFFFF",
    fontFamily: "Nunito_700Bold",
    fontSize: 10,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
