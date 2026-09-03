import { describe, it, expect } from "vitest";

/**
 * Geometry invariants for the LessonRoad. The component renders nodes and
 * the road path from the same model, so these tests pin the property the
 * user actually sees: every path segment starts and ends exactly on a node
 * center (the road cannot drift off the levels).
 */

import {
  buildRoadModel,
  fullPathD,
  isSegmentDone,
  segmentPathD,
  sideForIndex,
  type RoadModel,
} from "./LessonRoad.geometry";

/** Parse "M x y C x1 y1, x2 y2, x y" into its five points. */
function parseSegment(d: string): number[][] {
  const m = d.match(/^M (-?[\d.]+) (-?[\d.]+) C (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+)$/);
  expect(m).toBeTruthy();
  return [
    [Number(m![1]), Number(m![2])],
    [Number(m![3]), Number(m![4])],
    [Number(m![5]), Number(m![6])],
    [Number(m![7]), Number(m![8])],
  ];
}

describe("buildRoadModel — layout", () => {
  it("alternates node sides (serpentine) in side mode", () => {
    const model = buildRoadModel(400, 6);
    expect(model.mode).toBe("side");
    for (let i = 0; i < 6; i++) {
      expect(model.nodes[i].side).toBe(sideForIndex(i));
      expect(model.nodes[i].side).toBe(i % 2 === 0 ? "right" : "left");
    }
  });

  it("places node centers on the two lanes, symmetric about the center", () => {
    const model = buildRoadModel(400, 4);
    const right = model.nodes[0].x; // lesson 0 starts on the right lane
    const left = model.nodes[1].x;
    expect(right).toBeGreaterThan(model.width / 2);
    expect(left).toBeLessThan(model.width / 2);
    expect(right + left).toBeCloseTo(model.width, 1); // symmetric
  });

  it("keeps a constant vertical rhythm between node centers", () => {
    const model = buildRoadModel(400, 5);
    for (let i = 1; i < 5; i++) {
      expect(model.nodes[i].y - model.nodes[i - 1].y).toBe(model.rowHeight);
    }
  });

  it("switches to compact mode and centers nodes on very narrow screens", () => {
    const model = buildRoadModel(240, 3);
    expect(model.mode).toBe("compact");
    for (const node of model.nodes) {
      expect(node.x).toBe(model.width / 2);
    }
  });

  it("gives every label enough width for two lines of text", () => {
    for (const width of [240, 320, 400, 768, 1200]) {
      const model = buildRoadModel(width, 4);
      for (const node of model.nodes) {
        expect(node.labelWidth).toBeGreaterThanOrEqual(64);
        expect(node.labelLeft).toBeGreaterThanOrEqual(0);
        expect(node.labelLeft + node.labelWidth).toBeLessThanOrEqual(model.width);
      }
    }
  });
});

describe("buildRoadModel — path alignment", () => {
  it("starts every segment on a node center and ends on the next one", () => {
    const model = buildRoadModel(400, 5);
    expect(model.segments.length).toBe(5); // 4 inter-node + 1 into the goal

    model.segments.forEach((segment, i) => {
      const [start, , , end] = parseSegment(segment.d);
      expect(start[0]).toBeCloseTo(model.nodes[i].x, 1);
      expect(start[1]).toBeCloseTo(model.nodes[i].y, 1);
      const destination =
        segment.to < 5 ? model.nodes[segment.to] : model.goal;
      expect(end[0]).toBeCloseTo(destination.x, 1);
      expect(end[1]).toBeCloseTo(destination.y, 1);
    });
  });

  it("anchors control points at the vertical midpoint (smooth S-curves)", () => {
    const model = buildRoadModel(400, 4);
    model.segments.forEach((segment, i) => {
      const [, cp1, cp2] = parseSegment(segment.d);
      const destination =
        segment.to < model.nodes.length ? model.nodes[segment.to] : model.goal;
      const midY = (model.nodes[i].y + destination.y) / 2;
      expect(cp1[1]).toBe(midY); // control y at the midpoint
      expect(cp2[1]).toBe(midY); // both tangents vertical at the ends
      expect(cp1[0]).toBe(model.nodes[i].x);
      expect(cp2[0]).toBe(destination.x);
    });
  });

  it("places the goal below the last node and inside the canvas", () => {
    const model = buildRoadModel(400, 3);
    const last = model.nodes[2];
    expect(model.goal.y).toBeGreaterThan(last.y);
    expect(model.goal.y).toBeLessThan(model.height);
    expect(model.goal.x).toBe(model.width / 2);
  });

  it("handles a single lesson (only the goal segment) and zero lessons", () => {
    const single = buildRoadModel(400, 1);
    expect(single.segments.length).toBe(1);

    const empty = buildRoadModel(400, 0);
    expect(empty.segments.length).toBe(0);
    expect(empty.nodes.length).toBe(0);
  });

  it("serializes the full path from every segment", () => {
    const model = buildRoadModel(400, 3);
    const full = fullPathD(model);
    expect(full).toContain("M");
    // one M per segment
    expect(full.match(/M /g)!.length).toBe(model.segments.length);
  });
});

describe("segmentPathD", () => {
  it("is deterministic and uses vertical control points", () => {
    const a = { x: 100, y: 0 };
    const b = { x: 180, y: 132 };
    const d1 = segmentPathD(a, b);
    const d2 = segmentPathD(a, b);
    expect(d1).toBe(d2);
    const [, cp1, cp2] = parseSegment(d1);
    expect(cp1[0]).toBe(a.x); // control x pinned to source node
    expect(cp2[0]).toBe(b.x); // control x pinned to destination node
    expect(cp1[1]).toBe((a.y + b.y) / 2);
  });
});

describe("isSegmentDone", () => {
  const lessons: Array<{ completed: boolean }> = [
    { completed: true },
    { completed: true },
    { completed: false },
  ];

  it("is done when the source lesson (road already traveled) is completed", () => {
    expect(isSegmentDone(lessons as never, 1)).toBe(true);
    expect(isSegmentDone(lessons as never, 2)).toBe(true);
  });

  it("is not done ahead of the frontier (source lesson incomplete)", () => {
    const midProgress = [{ completed: true }, { completed: false }, { completed: false }];
    expect(isSegmentDone(midProgress as never, 2)).toBe(false);
    expect(isSegmentDone(midProgress as never, 1)).toBe(true);
    expect(isSegmentDone(midProgress as never, 0)).toBe(false);
  });

  it("the goal stretch is only done when every lesson is completed", () => {
    expect(isSegmentDone(lessons as never, 3)).toBe(false);
    const allDone = [{ completed: true }, { completed: true }];
    expect(isSegmentDone(allDone as never, 2)).toBe(true);
    expect(isSegmentDone([], 0)).toBe(false);
  });
});

describe("real-device smoke", () => {
  it("model for an iPhone-width course stays in side mode with sane bounds", () => {
    const model: RoadModel = buildRoadModel(390, 14);
    expect(model.mode).toBe("side");
    expect(model.width).toBe(390 - 40);
    expect(model.nodes.length).toBe(14);
    for (const node of model.nodes) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(model.width);
    }
    expect(fullPathD(model).length).toBeGreaterThan(100);
  });
});
