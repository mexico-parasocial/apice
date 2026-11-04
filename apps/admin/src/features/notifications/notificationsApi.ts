import { apiSlice } from "@/store/apiSlice";

export const notificationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAllNotifications: builder.query({
      query: () => ({
        url: "get-all-notifications",
        method: "GET",
      }),
    }),
    updateNotificationStatus: builder.mutation({
      query: (id) => ({
        url: `/update-notification/${id}`,
        method: "PUT",
      }),
    }),
  }),
});

export const {
  useGetAllNotificationsQuery,
  useUpdateNotificationStatusMutation,
} = notificationsApi;
