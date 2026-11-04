import type { LessonNode } from "../hooks/useCourseProgress";

/**
 * Pure geometry for the LessonRoad: every pixel the component renders (node
 * centers, label boxes, road path) derives from this one model, so the road
 * provably passes through the node centers instead of approximately near
 * them. No React Native imports — this runs in unit tests unchanged.
 *
 * Two layout modes, chosen from the measured container width:
 *  - "side": nodes alternate left/right of the centerline (serpentine), each
 *    label fills the space on the opposite side of the node.
 *  - "compact": narrow containers — nodes stack on the centerline with their
 *    label centered underneath, so text is never squeezed below readability.
 */

export type RoadSide = "left" | "right";
export type RoadMode = "side" | "compact";

export interface RoadMetrics {
  pad: number;
  minWidth: number;
  labelGap: number;
  stroke: number;
  /** per-mode metrics */
  nodeSize: number;
  rowHeight: number;
  /** vertical distance between the last lesson node and the goal node */
  goalDrop: number;
}

const SIDE_METRICS = {
  nodeSize: 64,
  rowHeight: 132,
  goalDrop: 96,
};

const COMPACT_METRICS = {
  nodeSize: 56,
  rowHeight: 164,
  goalDrop: 88,
};

export interface RoadNodeLayout {
  side: RoadSide;
  /** node center, content coordinates */
  x: number;
  y: number;
  /** label box, content coordinates */
  labelLeft: number;
  labelWidth: number;
  /** label box top relative to the row top */
  labelTop: number;
}

export interface RoadSegment {
  /** SVG path data for this segment (M … C …) */
  d: string;
  /** destination index; === nodes.length means the goal node */
  to: number;
}

export interface RoadModel {
  mode: RoadMode;
  /** content width (container minus horizontal padding) */
  width: number;
  /** total SVG height (road + goal + breathing room) */
  height: number;
  rowHeight: number;
  nodeSize: number;
  nodes: RoadNodeLayout[];
  segments: RoadSegment[];
  goal: { x: number; y: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Smooth S-curve between two node centers: vertical tangents at both ends,
 *  so consecutive segments join seamlessly at every node. */
export function segmentPathD(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const midY = r2((a.y + b.y) / 2);
  return `M ${r2(a.x)} ${r2(a.y)} C ${r2(a.x)} ${midY}, ${r2(b.x)} ${midY}, ${r2(b.x)} ${r2(b.y)}`;
}

export function buildRoadModel(containerWidth: number, lessonCount: number): RoadModel {
  const pad = 20;
  const minWidth = 240;
  const labelGap = 10;
  const stroke = 6;

  const width = Math.max(minWidth, Math.round(containerWidth) - pad * 2);
  const center = width / 2;

  const rawSway = Math.min(96, Math.max(24, width * 0.15));
  const sideLabelWidth = center - rawSway - SIDE_METRICS.nodeSize / 2 - labelGap;

  const mode: RoadMode = sideLabelWidth >= 72 ? "side" : "compact";
  const m = mode === "side" ? SIDE_METRICS : COMPACT_METRICS;
  const sway = mode === "side" ? rawSway : 0;

  const nodes: RoadNodeLayout[] = [];
  for (let i = 0; i < lessonCount; i++) {
    const side: RoadSide = i % 2 === 0 ? "right" : "left";
    const x = r2(center + (side === "right" ? sway : -sway));
    const y = r2(i * m.rowHeight + m.rowHeight / 2);

    let labelLeft: number;
    let labelWidth: number;
    let labelTop: number;
    if (mode === "side") {
      labelWidth = center - sway - m.nodeSize / 2 - labelGap;
      const nodeEdge = x + (side === "right" ? -1 : 1) * (m.nodeSize / 2 + labelGap);
      labelLeft = side === "right" ? nodeEdge - labelWidth : nodeEdge;
      labelTop = 0;
    } else {
      labelWidth = Math.min(width - 24, 260);
      labelLeft = center - labelWidth / 2;
      labelTop = m.rowHeight / 2 + m.nodeSize / 2 + 2;
    }
    nodes.push({ side, x, y, labelLeft: r2(labelLeft), labelWidth: r2(labelWidth), labelTop });
  }

  const last = nodes[lessonCount - 1];
  const goal = {
    x: r2(center),
    y: last
      ? r2(Math.max(last.y + m.goalDrop, lessonCount * m.rowHeight + m.nodeSize / 2 + 8))
      : r2(m.rowHeight / 2),
  };

  const segments: RoadSegment[] = [];
  for (let i = 1; i < lessonCount; i++) {
    segments.push({ d: segmentPathD(nodes[i - 1], nodes[i]), to: i });
  }
  if (last) {
    segments.push({ d: segmentPathD(last, goal), to: lessonCount });
  }

  const height = last ? r2(goal.y + m.nodeSize / 2 + 16) : r2(m.rowHeight);

  return {
    mode,
    width,
    height,
    rowHeight: m.rowHeight,
    nodeSize: m.nodeSize,
    nodes,
    segments,
    goal,
  };
}

/** Whether the road segment into `to` should read as completed: the road
 *  lights up from the last completed lesson forward, so an inter-node
 *  segment is done when its SOURCE lesson is done. The goal stretch is done
 *  only when every lesson is done. */
export function isSegmentDone(lessons: LessonNode[], to: number): boolean {
  if (to === lessons.length) {
    return lessons.length > 0 && lessons.every((l) => l.completed);
  }
  return to > 0 && Boolean(lessons[to - 1]?.completed);
}

/** Full road as one path (base layer under the colored segments). */
export function fullPathD(model: RoadModel): string {
  return model.segments.map((s) => s.d).join(" ");
}

/** Convenience for components/tests: the serpentine side of lesson i. */
export function sideForIndex(i: number): RoadSide {
  return i % 2 === 0 ? "right" : "left";
}
