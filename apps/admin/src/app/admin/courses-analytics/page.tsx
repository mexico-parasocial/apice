'use client'
import React from 'react'
import AdminSidebar from "@/features/dashboard/AdminSidebar";
import Heading from "@/components/Heading";
import CourseAnalytics from "@/features/analytics/CourseAnalytics";
import DashboardHeader from "@/features/dashboard/DashboardHeader";

type Props = {}

const page = (props: Props) => {
  return (
    <div>
        <Heading
         title="Ápice - Admin"
         description="Ápice — plataforma de formación ciudadana."
         keywords="Prograaming,MERN,Redux,Machine Learning"
        />
        <div className="flex">
            <div className="1500px:w-[16%] w-1/5">
                <AdminSidebar />
            </div>
            <div className="w-[85%]">
               <DashboardHeader />
               <CourseAnalytics />
            </div>
        </div>
    </div>
  )
}

export default page