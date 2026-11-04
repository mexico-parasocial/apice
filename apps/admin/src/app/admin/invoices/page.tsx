'use client'
import React from 'react'
import AdminSidebar from "@/features/dashboard/AdminSidebar";
import Heading from "@/components/Heading";
import DashboardHeader from "@/features/dashboard/DashboardHeader";
import AllInvoices from "@/features/orders/AllInvoices";

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
               <AllInvoices />
            </div>
        </div>
    </div>
  )
}

export default page