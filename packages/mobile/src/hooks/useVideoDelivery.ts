import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosInstance } from "axios";

export interface VideoDeliveryDeps {
  axios: AxiosInstance;
  serverUri: string;
  getAuthHeaders: () => Record<string, string | undefined>;
}

export interface PlaybackUrlResponse {
  success: boolean;
  lessonId: string;
  provider: string;
  playbackUrl: string;
  expiresAt: string | null;
  durationSeconds: number | null;
  resumeSeconds: number;
}

export interface ReportProgressInput {
  lessonId: string;
  watchedSeconds: number;
}

export interface ReportProgressResponse {
  success: boolean;
  lessonId: string;
  watchedSeconds: number;
  persisted: boolean;
}

export interface MarkCompleteResponse {
  success: boolean;
  lessonId: string;
  completed: boolean;
  persisted: boolean;
}

export function makeVideoDeliveryHooks(deps: VideoDeliveryDeps) {
  const { axios, serverUri, getAuthHeaders } = deps;

  function usePlaybackUrl(lessonId: string) {
    return useQuery<PlaybackUrlResponse>({
      queryKey: ["video-playback", lessonId],
      queryFn: async () => {
        const res = await axios.get(
          `${serverUri}/api/v1/videos/lessons/${lessonId}/playback`,
          { headers: getAuthHeaders() }
        );
        return res.data as PlaybackUrlResponse;
      },
      enabled: !!lessonId,
      staleTime: 5 * 60 * 1000,
    });
  }

  function useReportVideoProgress() {
    const queryClient = useQueryClient();

    return useMutation<ReportProgressResponse, unknown, ReportProgressInput>({
      mutationFn: async ({ lessonId, watchedSeconds }) => {
        const res = await axios.post(
          `${serverUri}/api/v1/videos/lessons/${lessonId}/progress`,
          { watchedSeconds },
          { headers: getAuthHeaders() }
        );
        return res.data as ReportProgressResponse;
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["video-playback", variables.lessonId],
        });
        // Prefix-match: completion/progress also feed the course-progress
        // queries (the lesson road on the detail screen), so they must be
        // invalidated too — this is what keeps the road correct without the
        // detail screen refetching unconditionally on every focus.
        queryClient.invalidateQueries({
          queryKey: ["course-progress"],
        });
      },
    });
  }

  function useMarkVideoComplete() {
    const queryClient = useQueryClient();

    return useMutation<
      MarkCompleteResponse,
      unknown,
      {
        lessonId: string;
        telemetry?: {
          startupMs?: number;
          stallCount?: number;
          errorCount?: number;
        };
      }
    >({
      mutationFn: async ({ lessonId, telemetry }) => {
        const res = await axios.post(
          `${serverUri}/api/v1/videos/lessons/${lessonId}/complete`,
          telemetry ? { telemetry } : {},
          { headers: getAuthHeaders() }
        );
        return res.data as MarkCompleteResponse;
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["video-playback", variables.lessonId],
        });
        // Prefix-match: completion/progress also feed the course-progress
        // queries (the lesson road on the detail screen), so they must be
        // invalidated too — this is what keeps the road correct without the
        // detail screen refetching unconditionally on every focus.
        queryClient.invalidateQueries({
          queryKey: ["course-progress"],
        });
      },
    });
  }

  return {
    usePlaybackUrl,
    useReportVideoProgress,
    useMarkVideoComplete,
  };
}
