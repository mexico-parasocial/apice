'use client'
import DashboardHero from '@/features/dashboard/DashboardHero'
import AdminProtected from '@/features/auth/AdminProtected'
import Heading from '@/components/Heading'
import React from 'react'
import AdminSidebar from "@/features/dashboard/AdminSidebar";
import AllCourses from "@/features/courses/AllCourses";

type Props = {}

const page = (props: Props) => {
  return (
    <div>
      <AdminProtected>
        <Heading
          title="Ápice - Admin"
          description="Ápice — plataforma de formación ciudadana."
          keywords="Programming,MERN,Redux,Machine Learning"
        />
        <div className="flex h-screen">
          <div className="1500px:w-[16%] w-1/5">
            <AdminSidebar />
          </div>
          <div className="w-[85%]">
            <DashboardHero />
            <AllCourses />
          </div>
        </div>
      </AdminProtected>
    </div>
  )
}

export default page