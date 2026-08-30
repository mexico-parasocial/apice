"use client";

import React, { FC, useState } from "react";
import { styles } from "@/app/styles/style";
import { toast } from "react-hot-toast";
import Cookies from "js-cookie";

type Props = {
  lessonId?: string;
  videoUrl: string;
  onChange: (value: string) => void;
};

const StreamplaceVideoRef: FC<Props> = ({ lessonId, videoUrl, onChange }) => {
  const [isSaving, setIsSaving] = useState(false);

  const isValidAtUri =
    videoUrl.startsWith("at://") && videoUrl.includes("/place.stream.video/");

  const handleSave = async () => {
    if (!lessonId) {
      toast.error("Guarda primero la lección para poder vincular el video.");
      return;
    }
    if (!isValidAtUri) {
      toast.error("El URI debe ser un at:// que apunte a place.stream.video");
      return;
    }

    setIsSaving(true);
    try {
      const accessToken = Cookies.get("accessToken");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/videos/lessons/${lessonId}/videoRef`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { "access-token": accessToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ videoUrl }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar");
      toast.success("Video vinculado a la lección");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el video");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-3">
      <label className={styles.label}>Video Url</label>
      <input
        type="text"
        placeholder="at://did:.../place.stream.video/..."
        className={`${styles.input}`}
        value={videoUrl}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-gray-500 mt-1">
        Sube el video en el{" "}
        <a
          href={process.env.NEXT_PUBLIC_STREAMPLACE_NODE_URL || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-600"
        >
          dashboard de Streamplace
        </a>{" "}
        y pega aquí el AT URI resultante.
      </p>
      {lessonId && (
        <button
          type="button"
          disabled={isSaving || !isValidAtUri}
          onClick={handleSave}
          className="mt-2 px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {isSaving ? "Guardando..." : "Vincular video ahora"}
        </button>
      )}
    </div>
  );
};

export default StreamplaceVideoRef;
