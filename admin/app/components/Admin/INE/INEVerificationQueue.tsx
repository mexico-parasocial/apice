import React, { FC, useEffect, useState } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { Box, Button, Dialog, DialogContent, Chip } from "@mui/material";
import { useTheme } from "next-themes";
import Loader from "../../Loader/Loader";
import { format } from "timeago.js";
import {
  useGetINEVerificationsQuery,
  useReviewINEVerificationMutation,
} from "@/redux/features/user/userApi";
import { toast } from "react-hot-toast";

type Props = {};

const statusColor: Record<string, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
};

const INEVerificationQueue: FC<Props> = () => {
  const { theme } = useTheme();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { isLoading, data, refetch } = useGetINEVerificationsQuery(statusFilter, {
    refetchOnMountOrArgChange: true,
  });
  const [reviewINEVerification, { isSuccess, error }] =
    useReviewINEVerificationMutation();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    status: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (isSuccess) {
      refetch();
      toast.success("Verification status updated");
    }
    if (error && "data" in error) {
      toast.error((error as any).data.message);
    }
  }, [isSuccess, error]);

  const handleConfirm = () => {
    if (confirmAction) {
      reviewINEVerification({ id: confirmAction.id, status: confirmAction.status });
      setConfirmAction(null);
    }
  };

  const columns = [
    { field: "id", headerName: "ID", flex: 0.3 },
    { field: "user", headerName: "User", flex: 0.5 },
    { field: "ineId", headerName: "INE ID", flex: 0.3 },
    {
      field: "status",
      headerName: "Status",
      flex: 0.3,
      renderCell: (params: any) => (
        <Chip
          label={params.value}
          color={statusColor[params.value] || "default"}
          size="small"
          variant="outlined"
        />
      ),
    },
    { field: "createdAt", headerName: "Submitted", flex: 0.4 },
    {
      field: "front",
      headerName: "Front",
      flex: 0.2,
      renderCell: (params: any) => (
        <button
          onClick={() => setPreviewImage(params.row.frontUrl)}
          className="text-blue-400 hover:underline cursor-pointer"
        >
          Preview
        </button>
      ),
    },
    {
      field: "back",
      headerName: "Back",
      flex: 0.2,
      renderCell: (params: any) => (
        <button
          onClick={() => setPreviewImage(params.row.backUrl)}
          className="text-blue-400 hover:underline cursor-pointer"
        >
          Preview
        </button>
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
            onClick={() =>
              setConfirmAction({
                id: params.row.id,
                status: "approved",
                label: "approve",
              })
            }
            disabled={params.row.status === "approved"}
          >
            Approve
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() =>
              setConfirmAction({
                id: params.row.id,
                status: "rejected",
                label: "reject",
              })
            }
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
        <h1 className="text-2xl font-bold dark:text-white text-black">
          INE Verifications
        </h1>
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
        <Box
          m="0 0 0 0"
          height="80vh"
          overflow="auto"
          className={theme === "dark" ? "dark" : ""}
        >
          <DataGrid checkboxSelection columns={columns} rows={rows} />
        </Box>
      )}

      {/* Image preview dialog */}
      <Dialog
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 1, display: "flex", justifyContent: "center" }}>
          {previewImage && (
            <img
              src={previewImage}
              alt="INE document"
              style={{ maxHeight: "70vh", objectFit: "contain" }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)}>
        <DialogContent>
          <p className="text-lg font-semibold mb-4">
            {confirmAction?.label === "approve"
              ? "Approve this INE verification?"
              : "Reject this INE verification?"}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {confirmAction?.label === "approve"
              ? "The user will be marked as verified."
              : "The user will need to resubmit their INE."}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outlined" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color={confirmAction?.status === "approved" ? "success" : "error"}
              onClick={handleConfirm}
            >
              {confirmAction?.label === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default INEVerificationQueue;
