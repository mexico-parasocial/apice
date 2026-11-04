import { makeCoursesHooks } from "@/hooks/useCourses";
import { makeCourseProgressHooks } from "@/hooks/useCourseProgress";
import { makeEnrollmentHooks } from "@/hooks/useEnrollment";
import { makeVideoDeliveryHooks } from "@/hooks/useVideoDelivery";
import { makeCertificateHooks } from "@/hooks/useCertificates";
import { makeIM8AuthHooks } from "@/hooks/useIM8Auth";
import { makePasswordAuthHooks } from "@/hooks/usePasswordAuth";
import { api } from "./client";
import { API_URL } from "@/env";

/**
 * Single instantiation of the shared-library hook factories.
 *
 * Every factory used to be instantiated per screen (8 copies), each with the
 * same `getAuthHeaders: () => ({})` — which only works because the axios
 * request interceptor injects the tokens. One place now documents that
 * coupling, and new hooks have exactly one obvious home.
 */
const deps = {
  axios: api,
  serverUri: API_URL,
  getAuthHeaders: () => ({}),
};

export const { useCourses, useCourse, useCourseContent } =
  makeCoursesHooks(deps);
export const { useCourseProgress, useUpdateLessonProgress, useQuiz, useSubmitQuiz } =
  makeCourseProgressHooks(deps);
export const { useEnrollmentStatus, useEnroll } = makeEnrollmentHooks(deps);
export const { usePlaybackUrl, useReportVideoProgress, useMarkVideoComplete } =
  makeVideoDeliveryHooks(deps);
export const { useMyCertificates, getCertificateDownloadUrl } =
  makeCertificateHooks(deps);
export const { useIM8Login } = makeIM8AuthHooks({
  axios: api,
  serverUri: API_URL,
});
export const { usePasswordLogin } = makePasswordAuthHooks({
  axios: api,
  serverUri: API_URL,
});
