import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";

interface ProtectedProps {
  children: React.ReactNode;
}

/**
 * Client-side gate for the admin pages. A convenience only: every admin API
 * route enforces the role on the server (authorizeRoles("admin")).
 */
export default function AdminProtected({ children }: ProtectedProps) {
  const { user } = useSelector((state: any) => state.auth);
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) router.replace("/");
  }, [isAdmin, router]);

  return isAdmin ? <>{children}</> : null;
}
