"use client";
import React, { FC, useState } from "react";
import Heading from "./utils/Heading";
import Login from "./components/Auth/Login";
import Signup from "./components/Auth/SignUp";
import Verification from "./components/Auth/Verification";

interface Props {}

const Page: FC<Props> = (props) => {
  const [route, setRoute] = useState("Login");

  return (
    <div>
      <Heading
        title="Ápice - Admin"
        description="Ápice — plataforma de formación ciudadana."
        keywords="formación ciudadana,cursos,Ápice"
      />
      <div className="w-[90%] md:w-[420px] m-auto h-screen flex items-center justify-center">
        {route === "Login" && <Login setRoute={setRoute} />}
        {route === "Sign-up" && <Signup setRoute={setRoute} />}
        {route === "Verification" && <Verification setRoute={setRoute} />}
      </div>
    </div>
  );
};

export default Page;
