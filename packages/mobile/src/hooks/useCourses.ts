import { useQuery } from "@tanstack/react-query";
import axios, { AxiosInstance } from "axios";

export interface CourseSummary {
  id: string;
  name: string;
  description: string;
  categories: string;
  price: number;
  estimatedPrice?: number;
  thumbnail?: { public_id?: string; url?: string };
  tags: string;
  level: string;
  demoUrl: string;
  benefits: { title: string }[];
  prerequisites: { title: string }[];
  ratings: number;
  purchased: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  description?: string;
  videoSection: string;
  videoLength?: number;
  videoPlayer?: string;
  isPreview?: boolean;
  isCheckpoint?: boolean;
}

export interface CourseDetail extends CourseSummary {
  courseData: CourseLesson[];
}

export interface CourseContent extends CourseDetail {
  // Populated once the user is enrolled.
  sections: {
    id: string;
    title: string;
    order: number;
    lessons: {
      id: string;
      title: string;
      description?: string;
      videoUrl?: string;
      videoLength?: number;
      order: number;
      isPreview: boolean;
      isCheckpoint: boolean;
    }[];
  }[];
}

export interface CoursesDeps {
  axios: AxiosInstance;
  serverUri: string;
  getAuthHeaders: () => Record<string, string | undefined>;
}

export function makeCoursesHooks(deps: CoursesDeps) {
  const { axios, serverUri, getAuthHeaders } = deps;

  function useCourses() {
    return useQuery<{ success: boolean; courses: CourseSummary[] }>({
      queryKey: ["courses"],
      queryFn: async () => {
        // The API paginates (default page is 12) — the catalogue asks for
        // the largest page so home + program list arrive in one request.
        const res = await axios.get(`${serverUri}/api/v1/get-courses`, {
          params: { limit: 50 },
        });
        return res.data;
      },
    });
  }

  function useCourse(courseId: string) {
    return useQuery<{ success: boolean; course: CourseDetail }>({
      queryKey: ["course", courseId],
      queryFn: async () => {
        const res = await axios.get(`${serverUri}/api/v1/get-course/${courseId}`);
        return res.data;
      },
      enabled: !!courseId,
    });
  }

  function useCourseContent(courseId: string) {
    return useQuery<{ success: boolean; course: CourseContent }>({
      queryKey: ["course-content", courseId],
      queryFn: async () => {
        const res = await axios.get(
          `${serverUri}/api/v1/get-course-content/${courseId}`,
          { headers: getAuthHeaders() }
        );
        return res.data;
      },
      enabled: !!courseId,
    });
  }

  return { useCourses, useCourse, useCourseContent };
}
