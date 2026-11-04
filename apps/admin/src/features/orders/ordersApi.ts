import { apiSlice } from "@/store/apiSlice";

export const ordersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAllOrders: builder.query({
      query: ({ page, limit }: { page?: number; limit?: number } = {}) => ({
        url: `get-orders?page=${page ?? 1}&limit=${limit ?? 50}`,
        method: "GET",
      }),
    }),
  }),
});

export const { useGetAllOrdersQuery } = ordersApi;
