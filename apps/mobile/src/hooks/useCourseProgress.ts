import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosInstance } from "axios";

export interface LessonNode {
  id: string;
  title: string;
  description?: string;
  videoLength?: number;
  sectionTitle?: string;
  globalIndex: number;
  completed: boolean;
  available: boolean;
  watchedSeconds: number;
  isCheckpoint?: boolean;
  quizPassed?: boolean | null;
}

export interface QuizQuestion {
  text: string;
  options: string[];
}

export interface QuizResponse {
  success: boolean;
  quiz: {
    id: string;
    lessonId: string;
    questions: QuizQuestion[];
  };
}

export interface QuizSubmitResponse {
  success: boolean;
  passed: boolean;
  score: number;
  correctCount: number;
  total: number;
}

export interface CourseProgressResponse {
  success: boolean;
  progress: number;
  completed: boolean;
  lastAccessedAt: string | null;
  lessons: LessonNode[];
}

export interface ProgressDeps {
  axios: AxiosInstance;
  serverUri: string;
  getAuthHeaders: () => Record<string, string | undefined>;
}

export function makeCourseProgressHooks(deps: ProgressDeps) {
  const { axios, serverUri, getAuthHeaders } = deps;

  function useCourseProgress(courseId: string) {
    return useQuery<CourseProgressResponse>({
      queryKey: ["course-progress", courseId],
      queryFn: async () => {
        const res = await axios.get(
          `${serverUri}/api/v1/get-progress/${courseId}`,
          { headers: getAuthHeaders() }
        );
        return res.data;
      },
      enabled: !!courseId,
    });
  }

  function useUpdateLessonProgress() {
    const queryClient = useQueryClient();

    return useMutation<
      any,
      unknown,
      { courseId: string; lessonId: string; completed?: boolean; watchedSeconds?: number }
    >({
      mutationFn: async (payload) => {
        const res = await axios.post(
          `${serverUri}/api/v1/update-progress`,
          payload,
          { headers: getAuthHeaders() }
        );
        return res.data;
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-progress", variables.courseId],
        });
      },
    });
  }

  function useQuiz(lessonId: string) {
    return useQuery<QuizResponse>({
      queryKey: ["quiz", lessonId],
      queryFn: async () => {
        const res = await axios.get(
          `${serverUri}/api/v1/quiz/${lessonId}`,
          { headers: getAuthHeaders() }
        );
        return res.data;
      },
      enabled: !!lessonId,
    });
  }

  function useSubmitQuiz() {
    const queryClient = useQueryClient();

    return useMutation<
      QuizSubmitResponse,
      unknown,
      { lessonId: string; answers: number[] }
    >({
      mutationFn: async (payload) => {
        const res = await axios.post(
          `${serverUri}/api/v1/quiz/${payload.lessonId}/submit`,
          { answers: payload.answers },
          { headers: getAuthHeaders() }
        );
        return res.data as QuizSubmitResponse;
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["quiz", variables.lessonId],
        });
      },
    });
  }

  return { useCourseProgress, useUpdateLessonProgress, useQuiz, useSubmitQuiz };
}
