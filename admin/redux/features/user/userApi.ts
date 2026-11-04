import { apiSlice } from "../api/apiSlice";

export const userApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAllUsers: builder.query({
      query: () => ({
        url: "get-users",
        method: "GET",
      }),
    }),
    updateUserRole: builder.mutation({
      query: ({ email, role }) => ({
        url: "update-user",
        method: "PUT",
        body: { email, role },
      }),
    }),
    deleteUser: builder.mutation({
      query: (id) => ({
        url: `delete-user/${id}`,
        method: "DELETE",
      }),
    }),
    getINEVerifications: builder.query({
      query: (status?: string) => ({
        url: `ine/verifications${status ? `?status=${status}` : ""}`,
        method: "GET",
      }),
    }),
    reviewINEVerification: builder.mutation({
      query: ({ id, status }: { id: string; status: string }) => ({
        url: `ine/verifications/${id}/review`,
        method: "PUT",
        body: { status },
      }),
    }),
  }),
});

export const {
  useGetAllUsersQuery,
  useUpdateUserRoleMutation,
  useDeleteUserMutation,
  useGetINEVerificationsQuery,
  useReviewINEVerificationMutation,
} = userApi;
