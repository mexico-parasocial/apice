import { AtpAgent } from "@atproto/api";
import { TID } from "@atproto/common-web";
import { prisma } from "../utils/db";
import { env } from "../utils/env";

let agent: AtpAgent | null = null;

export async function getOrCreateAgent() {
  if (agent) return agent;

  if (!env.PDS_SERVICE_HANDLE || !env.PDS_SERVICE_PASSWORD) {
    throw new Error("PDS_SERVICE_HANDLE and PDS_SERVICE_PASSWORD must be set to publish courses");
  }

  agent = new AtpAgent({ service: env.PDS_URL });
  await agent.login({
    identifier: env.PDS_SERVICE_HANDLE,
    password: env.PDS_SERVICE_PASSWORD,
  });

  return agent;
}

export type PublishCourseResult = {
  courseUri: string;
  courseCid: string;
  lessonUris: { lessonId: string; uri: string; cid: string }[];
};

export async function publishCourseToPDS(courseId: string): Promise<PublishCourseResult> {
  const a = await getOrCreateAgent();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!course) throw new Error("Course not found");
  if (!course.sections || course.sections.length === 0) {
    throw new Error("Course has no sections; cannot publish empty course record");
  }

  const now = new Date().toISOString();
  const ownerDid = env.PDS_PUBLISH_DID || (a?.did as string);

  // Publish each lesson and its video record first
  const lessonUris: PublishCourseResult["lessonUris"] = [];
  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      const videoRecord = {
        $type: "app.civic.video" as const,
        title: lesson.title,
        sources: lesson.videoUrl
          ? [
              {
                uri: lesson.videoUrl as string,
                mediaType: "application/vnd.apple.mpegurl",
              },
            ]
          : [],
        createdAt: now,
        durationSeconds: Math.round(lesson.videoLength || 0),
      };

      const videoKey = TID.nextStr();
      const videoPut = await a.com.atproto.repo.putRecord({
        repo: ownerDid,
        collection: "app.civic.video",
        rkey: videoKey,
        record: videoRecord as any,
        validate: true,
      });

      const lessonKey = TID.nextStr();
      const lessonRecord = {
        $type: "app.civic.lesson" as const,
        title: lesson.title,
        description: (lesson.description as string | null) || "",
        durationSeconds: Math.round(lesson.videoLength || 0),
        createdAt: now,
        courseRef: { uri: "", cid: "" },
        videoRef: {
          uri: `at://${ownerDid}/app.civic.video/${videoKey}`,
          cid: videoPut.data.cid as string,
        },
        order: lesson.order,
      };

      const lessonPut = await a.com.atproto.repo.putRecord({
        repo: ownerDid,
        collection: "app.civic.lesson",
        rkey: lessonKey,
        record: lessonRecord as any,
        validate: true,
      });

      lessonUris.push({
        lessonId: lesson.id,
        uri: `at://${ownerDid}/app.civic.lesson/${lessonKey}`,
        cid: lessonPut.data.cid as string,
      });
    }
  }

  // Build course record with lesson refs mapped back
  const lessonByUri = new Map(lessonUris.map((l) => [l.lessonId, l]));
  const sections = course.sections.map((section) => ({
    title: section.title,
    description: "",
    lessons: section.lessons
      .map((lesson) => {
        const ref = lessonByUri.get(lesson.id);
        return ref ? { uri: ref.uri, cid: ref.cid } : undefined;
      })
      .filter((ref): ref is { uri: string; cid: string } => Boolean(ref)),
  }));

  const courseRecord = {
    $type: "app.civic.course" as const,
    title: course.name,
    description: (course.description as string | null) || "",
    createdAt: now,
    ownerDid,
    tags: ((course.tags as string | null) || "").split(",").map((t) => t.trim()).filter(Boolean),
    sections,
  };

  const courseKey = TID.nextStr();
  const coursePut = await a.com.atproto.repo.putRecord({
    repo: ownerDid,
    collection: "app.civic.course",
    rkey: courseKey,
    record: courseRecord as any,
    validate: true,
  });

  // Patch lesson records to point back to the published course
  for (const lesson of lessonUris) {
    const rkey = lesson.uri.split("/").pop()!;
    const existing = await a.com.atproto.repo.getRecord({
      repo: ownerDid,
      collection: "app.civic.lesson",
      rkey,
    });
    await a.com.atproto.repo.putRecord({
      repo: ownerDid,
      collection: "app.civic.lesson",
      rkey,
      record: {
        ...(existing.data.value as any),
        courseRef: {
          uri: `at://${ownerDid}/app.civic.course/${courseKey}`,
          cid: coursePut.data.cid as string,
        },
      } as any,
      validate: true,
    });
  }

  // Persist AT-URI back to the local DB so we can resolve it later
  await prisma.course.update({
    where: { id: courseId },
    data: {
      atprotoUri: `at://${ownerDid}/app.civic.course/${courseKey}`,
      atprotoCid: coursePut.data.cid as string,
    },
  });

  return {
    courseUri: `at://${ownerDid}/app.civic.course/${courseKey}`,
    courseCid: coursePut.data.cid as string,
    lessonUris,
  };
}

export async function readCourseRecord(uri: string) {
  const a = await getOrCreateAgent();
  const { data } = await a.com.atproto.repo.getRecord({
    repo: uri.split("/")[2],
    collection: "app.civic.course",
    rkey: uri.split("/").pop()!,
  });
  return data;
}

export async function describeCourseRepo(repo: string) {
  const a = await getOrCreateAgent();
  const { data } = await a.com.atproto.repo.describeRepo({ repo });
  return data;
}

