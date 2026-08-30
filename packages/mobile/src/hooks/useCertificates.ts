import { useMutation, useQuery } from "@tanstack/react-query";
import axios, { AxiosInstance } from "axios";

export interface Certificate {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  issuedAt: string;
  svgContent?: string;
  downloadUrl: string;
}

export interface CertificatesDeps {
  axios: AxiosInstance;
  serverUri: string;
  getAuthHeaders: () => Record<string, string | undefined>;
}

export interface ClaimCertificateResponse {
  success: boolean;
  certificate: Certificate;
  alreadyClaimed?: boolean;
}

export function makeCertificateHooks(deps: CertificatesDeps) {
  const { axios, serverUri, getAuthHeaders } = deps;

  function useMyCertificates(options: { enabled?: boolean } = {}) {
    return useQuery<{ success: boolean; certificates: Certificate[] }>({
      queryKey: ["certificates"],
      queryFn: async () => {
        const res = await axios.get(`${serverUri}/api/v1/certificates`, {
          headers: getAuthHeaders(),
        });
        return res.data;
      },
      enabled: options.enabled ?? true,
    });
  }

  function useClaimCertificate() {
    return useMutation<ClaimCertificateResponse, unknown, { courseId: string }>({
      mutationFn: async ({ courseId }: { courseId: string }) => {
        const res = await axios.post(
          `${serverUri}/api/v1/certificates/${courseId}/claim`,
          {},
          { headers: getAuthHeaders() }
        );
        return res.data as ClaimCertificateResponse;
      },
    });
  }

  function getCertificateDownloadUrl(certificateId: string) {
    // Tolerate a trailing slash in serverUri — this URL is handed to the OS
    // (Linking / share sheet), where a `//api` shows up only as a no-op.
    const base = serverUri.replace(/\/+$/, "");
    return `${base}/api/v1/certificates/${certificateId}/download`;
  }

  return {
    useMyCertificates,
    useClaimCertificate,
    getCertificateDownloadUrl,
  };
}
