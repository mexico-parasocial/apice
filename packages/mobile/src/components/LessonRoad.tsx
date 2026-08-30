import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { LessonNode } from "../hooks/useCourseProgress";
import type { UseMutationResult } from "@tanstack/react-query";

const PAD = 24;
const ROAD_WIDTH = 8;
const NODE_SIZE = 56;
const ROW_HEIGHT = 140; // vertical distance between nodes
const LABEL_GAP = 8;

/**
 * Road geometry derived from the width the component is actually given.
 *
 * This used to read Dimensions.get("window") at module scope, which freezes
 * at import time — on web the layout never responded to a browser resize, and
 * inside a max-width container it sized to the whole window instead of its
 * own box. The component measures itself via onLayout instead.
 *
 * The zig-zag amplitude has to leave room for the lesson label beside each
 * node, otherwise titles clip at the edge on phone widths.
 */
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

  // Measured from the box we're actually rendered into, so the road adapts to
  // a browser resize and to being placed inside a max-width column.
  const [containerWidth, setContainerWidth] = React.useState(0);
  const { contentWidth, centerX, sway, labelWidth } = useMemo(
    () => roadGeometry(containerWidth),
    [containerWidth]
  );

  const colors = useMemo(
    () => ({
      // Brand ramp (see alf/index.tsx) — the road lives on the same purple
      // family as the wordmark instead of a borrowed electric violet.
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
      // Checkpoint lesson: video watched but its quiz hasn't been passed yet
      // — distinct from both "locked" and "done" so the road doesn't lie
      // about a lesson being finished.
      nodeQuizPending: "#D4AF37",
      shadow: isDark ? "rgba(140,58,160,0.3)" : "rgba(74,16,82,0.15)",
    }),
    [isDark]
  );

  const nodes = useMemo(() => {
    return lessons.map((lesson, index) => {
      const row = Math.floor(index / 2);
      const isRight = index % 2 === 0;
      const x = isRight ? centerX + sway : centerX - sway;
      const y = index * ROW_HEIGHT + NODE_SIZE / 2;
      return { ...lesson, x, y, index };
    });
  }, [lessons, centerX, sway]);

  const pathD = useMemo(() => {
    if (nodes.length === 0) return "";
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const cp1x = prev.x;
      const cp1y = prev.y + ROW_HEIGHT * 0.5;
      const cp2x = curr.x;
      const cp2y = curr.y - ROW_HEIGHT * 0.5;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
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

  const renderNode = (node: LessonNode & { x: number; y: number; index: number }) => {
    const isActive = activeLessonId === node.id;
    const isLocked = !node.available;
    const videoWatched = node.completed;
    // Video watched, but a checkpoint's quiz still needs a passing attempt —
    // shown as its own state so the road doesn't claim the lesson is done.
    const quizPending = node.isCheckpoint && videoWatched && node.quizPassed !== true;
    // Fully done: video watched, and the quiz (if any) is passed.
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

    return (
      <TouchableOpacity
        key={node.id}
        activeOpacity={isLocked ? 1 : 0.7}
        onPress={() => handleNodePress(node)}
        style={[
          styles.node,
          {
            left: node.x - NODE_SIZE / 2,
            top: node.y - NODE_SIZE / 2,
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

        {/* Boss badge — marks a checkpoint lesson regardless of state, so a
            learner can see ahead of time that a quiz gates what comes next. */}
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

        <View
          style={[
            styles.label,
            {
              width: labelWidth,
              left: node.index % 2 === 0 ? NODE_SIZE + LABEL_GAP : "auto" as any,
              right: node.index % 2 === 0 ? "auto" as any : NODE_SIZE + LABEL_GAP,
            },
          ]}
        >
          <Text
            style={[
              styles.title,
              { color: colors.text },
              isLocked && { color: colors.muted },
            ]}
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

        {!videoWatched && !isLocked && (
          <TouchableOpacity
            onPress={() => handleComplete(node)}
            style={[
              styles.completeButton,
              { backgroundColor: colors.nodeCompleted },
            ]}
          >
            <Text style={styles.completeText}>Hecho</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: contentWidth,
            height: (lessons.length - 1) * ROW_HEIGHT + NODE_SIZE + 80,
          }}
        >
          <SvgPath
            d={pathD}
            progress={progress}
            colors={colors}
            width={contentWidth}
            totalLessons={lessons.length}
            completedCount={lessons.filter((l) => l.completed).length}
          />
          {nodes.map(renderNode)}
        </View>
      </ScrollView>
    </View>
  );
}

function SvgPath({
  d,
  progress,
  colors,
  completedCount,
  totalLessons,
  width,
}: {
  d: string;
  progress: number;
  colors: any;
  completedCount: number;
  totalLessons: number;
  width: number;
}) {
  const completedRatio =
    totalLessons === 0 ? 0 : completedCount / totalLessons;
  const height = totalLessons * ROW_HEIGHT + 80;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: "visible" }}
      >
        <Defs>
          <LinearGradient id="roadGradient" x1="0" y1="0" x2="0" y2={height}>
            <Stop offset="0" stopColor={colors.roadDone} />
            <Stop offset={completedRatio} stopColor={colors.roadDone} />
            <Stop offset={completedRatio} stopColor={colors.roadAvailable} />
            <Stop offset="1" stopColor={colors.road} />
          </LinearGradient>
        </Defs>
        <Path
          d={d}
          fill="none"
          stroke="url(#roadGradient)"
          strokeWidth={ROAD_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
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
  scroll: {
    paddingHorizontal: PAD,
    paddingBottom: 80,
  },
  node: {
    position: "absolute",
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
  label: {
    position: "absolute",
    top: 4,
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
    position: "absolute",
    bottom: -10,
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
