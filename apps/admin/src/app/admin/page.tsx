"use client";
import React from "react";
import Heading from "@/components/Heading";
import AdminSidebar from "@/features/dashboard/AdminSidebar";
import AdminProtected from "@/features/auth/AdminProtected";
import DashboardHero from "@/features/dashboard/DashboardHero";

type Props = {};

const page = (props: Props) => {
  return (
    <div>
      <AdminProtected>
        <Heading
          title="Ápice - Admin"
          description="Ápice — plataforma de formación ciudadana."
          keywords="Programming,MERN,Redux,Machine Learning"
        />
        <div className="flex min-h-screen">
          <div className="1500px:w-[16%] w-1/5">
            <AdminSidebar />
          </div>
          <div className="w-[85%]">
            <DashboardHero isDashboard={true} />
          </div>
        </div>
      </AdminProtected>
    </div>
  );
};

export default page;
