'use client'
import AdminProtected from '@/app/hooks/adminProtected'
import Heading from '@/app/utils/Heading'
import React from 'react'
import AdminSidebar from "../../components/Admin/sidebar/AdminSidebar";
import INEVerificationQueue from "../../components/Admin/INE/INEVerificationQueue";

const page = () => {
  return (
    <div>
      <AdminProtected>
        <Heading
          title="INE Verifications - Admin"
          description="Review voter credential submissions"
          keywords="INE, verification, admin"
        />
        <div className="flex h-screen">
          <div className="1500px:w-[16%] w-1/5">
            <AdminSidebar />
          </div>
          <div className="w-[85%]">
            <INEVerificationQueue />
          </div>
        </div>
      </AdminProtected>
    </div>
  )
}

export default page
