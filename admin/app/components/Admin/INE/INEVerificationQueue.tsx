import React, { FC, useEffect, useState } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { Box, Button } from "@mui/material";
import { useTheme } from "next-themes";
import Loader from "../../Loader/Loader";
import { format } from "timeago.js";
import {
  useGetINEVerificationsQuery,
  useReviewINEVerificationMutation,
} from "@/redux/features/user/userApi";
import { toast } from "react-hot-toast";

type Props = {};

const INEVerificationQueue: FC<Props> = () => {
  const { theme } = useTheme();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { isLoading, data, refetch } = useGetINEVerificationsQuery(statusFilter, {
    refetchOnMountOrArgChange: true,
  });
  const [reviewINEVerification, { isSuccess, error }] = useReviewINEVerificationMutation();

  useEffect(() => {
    if (isSuccess) {
      refetch();
      toast.success("Verification status updated");
    }
    if (error && "data" in error) {
      toast.error((error as any).data.message);
    }
  }, [isSuccess, error]);

  const columns = [
    { field: "id", headerName: "ID", flex: 0.3 },
    { field: "user", headerName: "User", flex: 0.5 },
    { field: "ineId", headerName: "INE ID", flex: 0.4 },
    { field: "status", headerName: "Status", flex: 0.3 },
    { field: "createdAt", headerName: "Submitted", flex: 0.4 },
    {
      field: "front",
      headerName: "Front",
      flex: 0.2,
      renderCell: (params: any) => (
        <a href={params.row.frontUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline">
          View
        </a>
      ),
    },
    {
      field: "back",
      headerName: "Back",
      flex: 0.2,
      renderCell: (params: any) => (
        <a href={params.row.backUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline">
          View
        </a>
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      flex: 0.4,
      renderCell: (params: any) => (
        <div className="flex gap-2">
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={() => reviewINEVerification({ id: params.row.id, status: "approved" })}
            disabled={params.row.status === "approved"}
          >
            Approve
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => reviewINEVerification({ id: params.row.id, status: "rejected" })}
            disabled={params.row.status === "rejected"}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  const rows =
    data?.verifications?.map((v: any) => ({
      id: v.id,
      user: v.user?.name || v.user?.email || v.userId,
      ineId: v.ineId || "—",
      status: v.status,
      createdAt: format(v.createdAt),
      frontUrl: v.frontUrl,
      backUrl: v.backUrl,
    })) || [];

  return (
    <div className="mt-[80px] pl-10 pr-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-white text-black">INE Verifications</h1>
        <div className="flex gap-2">
          {["all", "pending", "approved", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === "all" ? undefined : s)}
              className={`px-4 py-2 rounded capitalize ${
                (statusFilter || "all") === s
                  ? "bg-[#1E40AF] text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-black dark:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Loader />
      ) : (
        <Box m="0 0 0 0" height="80vh" overflow="auto" className={theme === "dark" ? "dark" : ""}>
          <DataGrid checkboxSelection columns={columns} rows={rows} />
        </Box>
      )}
    </div>
  );
};

export default INEVerificationQueue;
