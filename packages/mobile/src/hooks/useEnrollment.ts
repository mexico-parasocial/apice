import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosInstance } from "axios";

export interface EnrollmentDeps {
  axios: AxiosInstance;
  serverUri: string;
  getAuthHeaders: () => Record<string, string | undefined>;
}

/**
 * Free-enrollment hooks (check status / enroll) — mirrors the
 * /api/v1/enrollments endpoints.
 */
export function makeEnrollmentHooks(deps: EnrollmentDeps) {
  const { axios, serverUri, getAuthHeaders } = deps;

  function useEnrollmentStatus(courseId: string, enabled = true) {
    return useQuery<{ success: boolean; enrolled: boolean }>({
      queryKey: ["enrollment", courseId],
      queryFn: async () => {
        const res = await axios.get(
          `${serverUri}/api/v1/enrollments/${courseId}/check`,
          { headers: getAuthHeaders() }
        );
        return res.data;
      },
      enabled: enabled && !!courseId,
    });
  }

  function useEnroll() {
    const queryClient = useQueryClient();

    return useMutation<unknown, unknown, { courseId: string }>({
      mutationFn: async ({ courseId }) => {
        const res = await axios.post(
          `${serverUri}/api/v1/enrollments/${courseId}`,
          {},
          { headers: getAuthHeaders() }
        );
        return res.data;
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["enrollment", variables.courseId],
        });
        queryClient.invalidateQueries({
          queryKey: ["course-progress", variables.courseId],
        });
      },
    });
  }

  return { useEnrollmentStatus, useEnroll };
}
