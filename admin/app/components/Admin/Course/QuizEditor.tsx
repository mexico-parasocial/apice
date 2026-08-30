"use client";

import React, { FC, useEffect, useState } from "react";
import { styles } from "@/app/styles/style";
import { toast } from "react-hot-toast";
import Cookies from "js-cookie";
import { AiOutlineDelete, AiOutlinePlusCircle } from "react-icons/ai";
import { MdOutlineKeyboardArrowDown } from "react-icons/md";

type DraftQuestion = {
  text: string;
  options: string[];
  correctIndex: number;
};

type Props = {
  lessonId?: string;
};

const blankQuestion = (): DraftQuestion => ({
  text: "",
  options: ["", ""],
  correctIndex: 0,
});

function authHeaders() {
  const accessToken = Cookies.get("accessToken");
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { "access-token": accessToken } : {}),
  };
}

/**
 * Attaches or edits the checkpoint quiz for a lesson. Same self-contained
 * pattern as StreamplaceVideoRef: its own fetch calls, its own save state,
 * no Redux slice — this is a small, lesson-scoped side panel, not a page.
 *
 * A lesson only becomes a "checkpoint" (blocks the next lesson until passed)
 * by having a quiz attached — the server keeps `isCheckpoint` and the Quiz
 * row in sync, so there's no separate toggle to get out of sync here.
 */
const QuizEditor: FC<Props> = ({ lessonId }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasQuiz, setHasQuiz] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!expanded || !lessonId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`${process.env.NEXT_PUBLIC_SERVER_URI}/quiz/${lessonId}`, {
      headers: authHeaders(),
      credentials: "include",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setHasQuiz(false);
          setQuestions([]);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al cargar el cuestionario");
        setHasQuiz(true);
        setQuestions(
          (data.quiz.questions as DraftQuestion[]).map((q) => ({
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex ?? 0,
          }))
        );
      })
      .catch((err: any) => {
        if (!cancelled) toast.error(err.message || "Error al cargar el cuestionario");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, lessonId]);

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, blankQuestion()]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionText = (index: number, text: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, text } : q))
    );
  };

  const handleOptionText = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const options = [...q.options];
        options[oIndex] = value;
        return { ...q, options };
      })
    );
  };

  const handleAddOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: [...q.options, ""] } : q))
    );
  };

  const handleRemoveOption = (qIndex: number, oIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        if (q.options.length <= 2) return q; // server requires >= 2 options
        const options = q.options.filter((_, oi) => oi !== oIndex);
        const correctIndex =
          q.correctIndex >= options.length ? 0 : q.correctIndex;
        return { ...q, options, correctIndex };
      })
    );
  };

  const handleCorrectIndex = (qIndex: number, oIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, correctIndex: oIndex } : q))
    );
  };

  const validate = (): string | null => {
    if (questions.length === 0) return "Agrega al menos una pregunta.";
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) return `La pregunta ${i + 1} no puede estar vacía.`;
      const filled = q.options.filter((o) => o.trim().length > 0);
      if (filled.length < 2)
        return `La pregunta ${i + 1} necesita al menos 2 opciones.`;
      if (!q.options[q.correctIndex]?.trim())
        return `La pregunta ${i + 1}: la opción correcta no puede estar vacía.`;
    }
    return null;
  };

  const handleSave = async () => {
    if (!lessonId) {
      toast.error("Guarda primero la lección para poder agregar un cuestionario.");
      return;
    }
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URI}/quiz`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ lessonId, questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar el cuestionario");
      setHasQuiz(true);
      toast.success("Cuestionario guardado — esta lección ya es un checkpoint.");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el cuestionario");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lessonId) return;
    if (!confirm("¿Eliminar el cuestionario? La lección dejará de ser un checkpoint."))
      return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URI}/quiz/${lessonId}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al eliminar el cuestionario");
      setHasQuiz(false);
      setQuestions([]);
      toast.success("Cuestionario eliminado.");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el cuestionario");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mb-4 border border-[#ffffff30] dark:border-[#ffffff30] rounded p-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <p className="font-Poppins text-black dark:text-white flex items-center">
          Cuestionario de cierre
          {hasQuiz && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-500 text-white">
              checkpoint
            </span>
          )}
        </p>
        <MdOutlineKeyboardArrowDown
          fontSize="large"
          className="dark:text-white text-black"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </div>

      {expanded && (
        <div className="mt-3">
          {!lessonId ? (
            <p className="text-xs text-gray-500">
              Guarda primero la lección para poder agregar un cuestionario.
            </p>
          ) : loading ? (
            <p className="text-xs text-gray-500">Cargando…</p>
          ) : (
            <>
              {!hasQuiz && questions.length === 0 && (
                <p className="text-xs text-gray-500 mb-2">
                  Esta lección no tiene cuestionario. Al guardar uno, la lección se
                  vuelve un checkpoint y bloqueará la siguiente hasta aprobarlo.
                </p>
              )}

              {questions.map((q, qIndex) => (
                <div
                  key={qIndex}
                  className="mb-3 p-2 bg-[#cdc8c817] rounded"
                >
                  <div className="flex items-center justify-between">
                    <label className={styles.label}>Pregunta {qIndex + 1}</label>
                    <AiOutlineDelete
                      className="cursor-pointer text-black dark:text-white text-[18px]"
                      onClick={() => handleRemoveQuestion(qIndex)}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Texto de la pregunta"
                    className={styles.input}
                    value={q.text}
                    onChange={(e) => handleQuestionText(qIndex, e.target.value)}
                  />

                  {q.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center mt-2 gap-2">
                      <input
                        type="radio"
                        name={`correct-${lessonId}-${qIndex}`}
                        checked={q.correctIndex === oIndex}
                        onChange={() => handleCorrectIndex(qIndex, oIndex)}
                        title="Marcar como respuesta correcta"
                      />
                      <input
                        type="text"
                        placeholder={`Opción ${oIndex + 1}`}
                        className={`${styles.input} !mt-0 flex-1`}
                        value={opt}
                        onChange={(e) =>
                          handleOptionText(qIndex, oIndex, e.target.value)
                        }
                      />
                      {q.options.length > 2 && (
                        <AiOutlineDelete
                          className="cursor-pointer text-black dark:text-white text-[16px]"
                          onClick={() => handleRemoveOption(qIndex, oIndex)}
                        />
                      )}
                    </div>
                  ))}

                  <p
                    className="mt-2 flex items-center text-[14px] dark:text-white text-black cursor-pointer w-fit"
                    onClick={() => handleAddOption(qIndex)}
                  >
                    <AiOutlinePlusCircle className="mr-1" /> Agregar opción
                  </p>
                </div>
              ))}

              <p
                className="flex items-center text-[16px] dark:text-white text-black cursor-pointer mb-3"
                onClick={handleAddQuestion}
              >
                <AiOutlinePlusCircle className="mr-2" /> Agregar pregunta
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {isSaving ? "Guardando..." : "Guardar cuestionario"}
                </button>
                {hasQuiz && (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDelete}
                    className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50"
                  >
                    {isDeleting ? "Eliminando..." : "Eliminar cuestionario"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default QuizEditor;
