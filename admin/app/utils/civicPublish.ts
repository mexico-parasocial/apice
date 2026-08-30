"use client";

import type { OAuthSession } from "@atproto/oauth-client-browser";
import Cookies from "js-cookie";

/**
 * Instructor-owned course publishing (Workstream E).
 *
 * Writes app.civic.{video,lesson,course} records directly to the instructor's
 * own PDS using their OAuth session, then registers the resulting AT URIs back
 * to Ápice. The instructor's DID owns the records — Ápice only stores refs.
 *
 * Differences from the server-side service-account flow:
 * - lessons without a video produce NO app.civic.video record (the lexicon
 *   requires sources.minLength=1) and no videoRef on the lesson;
 * - lesson URI map is returned so Ápice can store it (atprotoLessonRefs) for
 *   the credential writer.
 */

export interface StrongRef {
  uri: string;
  cid: string;
}

export interface PublishResult {
  courseUri: string;
  courseCid: string;
  lessonRefs: Record<string, StrongRef>;
}

interface CourseBasics {
  id?: string;
  _id?: string;
  name: string;
  description?: string;
  tags?: string;
}

interface LessonContent {
  id: string;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  videoSection?: string;
  videoLength?: number | null;
}

const B32 = "234567abcdefghijklmnopqrstuvwxyz";

/** Sortable 13-char record key (TID-compatible shape). */
function nextRkey(): string {
  let time = Date.now();
  let out = "";
  for (let i = 0; i < 11; i++) {
    out = B32[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out + B32[Math.floor(Math.random() * 32)] + B32[Math.floor(Math.random() * 32)];
}

async function xrpc<T>(
  session: OAuthSession,
  method: string,
  body: unknown
): Promise<T> {
  // Relative path — resolves against the session's own PDS (tokenSet.aud),
  // so records land on the instructor's PDS wherever it is hosted.
  const res = await session.fetchHandler(`/xrpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Error ${res.status} en ${method}`);
  }
  return data as T;
}

function createRecord<T = { uri: string; cid: string }>(
  session: OAuthSession,
  collection: string,
  record: Record<string, unknown>
): Promise<T> {
  return xrpc<T>(session, "com.atproto.repo.createRecord", {
    repo: session.sub,
    collection,
    record,
  });
}

async function fetchCourseContent(courseId: string): Promise<LessonContent[]> {
  const accessToken = Cookies.get("accessToken");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URI}/get-admin-course-content/${courseId}`,
    {
      headers: accessToken ? { "access-token": accessToken } : {},
      credentials: "include",
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo cargar el contenido del curso");
  }
  return data.content ?? [];
}

/**
 * Publishes a course to the instructor's own PDS.
 * Mirrors server/services/atproto.service.ts publishCourseToPDS.
 */
export async function publishCourseToOwnPds(
  session: OAuthSession,
  course: CourseBasics
): Promise<PublishResult> {
  const courseId = (course.id || course._id) as string;
  const content = await fetchCourseContent(courseId);
  if (content.length === 0) {
    throw new Error("El curso no tiene lecciones; crea el contenido primero");
  }

  const now = new Date().toISOString();
  const did = session.sub;
  const lessonRefs: Record<string, StrongRef> = {};

  // Group lessons by section, preserving order.
  const sectionOrder: string[] = [];
  const bySection = new Map<string, LessonContent[]>();
  for (const lesson of content) {
    const title = lesson.videoSection || "General";
    if (!bySection.has(title)) {
      bySection.set(title, []);
      sectionOrder.push(title);
    }
    bySection.get(title)!.push(lesson);
  }

  // 1-2. Video + lesson records.
  for (const lesson of content) {
    let videoRef: StrongRef | undefined;

    if (lesson.videoUrl) {
      const videoRecord = await createRecord(session, "app.civic.video", {
        $type: "app.civic.video",
        title: lesson.title,
        sources: [
          {
            uri: lesson.videoUrl,
            mediaType: lesson.videoUrl.startsWith("at://")
              ? "application/vnd.apple.mpegurl"
              : "video/mp4",
          },
        ],
        createdAt: now,
        durationSeconds: Math.round(lesson.videoLength || 0),
      });
      videoRef = { uri: videoRecord.uri, cid: videoRecord.cid };
    }

    const lessonRecord = await createRecord(session, "app.civic.lesson", {
      $type: "app.civic.lesson",
      title: lesson.title,
      description: lesson.description || "",
      durationSeconds: Math.round(lesson.videoLength || 0),
      createdAt: now,
      // Patched with the real course strongRef after the course is created.
      courseRef: { uri: "", cid: "" },
      ...(videoRef ? { videoRef } : {}),
    });

    lessonRefs[lesson.id] = { uri: lessonRecord.uri, cid: lessonRecord.cid };
  }

  // 3. Course record.
  const sections = sectionOrder.map((title) => ({
    title,
    description: "",
    lessons: (bySection.get(title) ?? [])
      .map((lesson) => lessonRefs[lesson.id])
      .filter(Boolean),
  }));

  const tags = (course.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const courseRecord = await createRecord(session, "app.civic.course", {
    $type: "app.civic.course",
    title: course.name,
    description: course.description || "",
    createdAt: now,
    ownerDid: did,
    tags,
    sections,
  });

  const courseRef: StrongRef = { uri: courseRecord.uri, cid: courseRecord.cid };

  // 4. Patch lessons with the real courseRef (getRecord is a query → GET).
  for (const ref of Object.values(lessonRefs)) {
    const rkey = ref.uri.split("/").pop()!;
    const res = await session.fetchHandler(
      `/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(
        did
      )}&collection=app.civic.lesson&rkey=${encodeURIComponent(rkey)}`
    );
    if (!res.ok) continue;
    const recordValue = (await res.json())?.value;
    if (!recordValue) continue;

    await xrpc(session, "com.atproto.repo.putRecord", {
      repo: did,
      collection: "app.civic.lesson",
      rkey,
      record: { ...recordValue, courseRef },
    });
  }

  // 5. Register the refs back to Ápice.
  const accessToken = Cookies.get("accessToken");
  const registerRes = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER_URI}/course/${courseId}/atprotoRef`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { "access-token": accessToken } : {}),
      },
      credentials: "include",
      body: JSON.stringify({
        courseUri: courseRef.uri,
        courseCid: courseRef.cid,
        lessonRefs,
      }),
    }
  );
  const registerData = await registerRes.json().catch(() => ({}));
  if (!registerRes.ok) {
    throw new Error(
      registerData.message ||
        "Publicado en tu PDS, pero no se pudieron registrar los URIs en Ápice"
    );
  }

  return { courseUri: courseRef.uri, courseCid: courseRef.cid, lessonRefs };
}

export { nextRkey };
