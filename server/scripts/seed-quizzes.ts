/**
 * Seed quizzes for the checkpoint lesson at the end of each demo
 * course. Content matches each lesson's own description so it reads as real
 * material, not filler.
 *
 * Attaching a quiz sets `CourseLesson.isCheckpoint = true` as a side effect
 * (same as the admin authoring endpoint) — the two can't drift apart.
 *
 * Run with:
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/seed-quizzes.ts
 */

import { prisma } from "../utils/db";

interface QuizQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

interface LessonQuiz {
  lessonTitle: string;
  questions: QuizQuestion[];
}

const quizzes: LessonQuiz[] = [
  {
    // Fundamentos de Participación Cívica → "Consulta ciudadana"
    lessonTitle: "Consulta ciudadana",
    questions: [
      {
        text: "¿Qué es el presupuesto participativo?",
        options: [
          "Un mecanismo donde la ciudadanía decide en qué se invierte parte del gasto público",
          "El presupuesto que aprueba únicamente el poder legislativo",
          "Un fondo privado para campañas electorales",
        ],
        correctIndex: 0,
      },
      {
        text: "Una consulta pública sirve principalmente para...",
        options: [
          "Sustituir las elecciones",
          "Recoger la opinión ciudadana antes de una decisión de política pública",
          "Elegir al gabinete del gobierno",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    // Derechos y Deberes Ciudadanos → "Responsabilidades ciudadanas"
    lessonTitle: "Responsabilidades ciudadanas",
    questions: [
      {
        text: "¿Por qué las responsabilidades ciudadanas equilibran a los derechos?",
        options: [
          "Porque son opcionales una vez que se ejercen los derechos",
          "Porque el ejercicio pleno de los derechos implica también obligaciones hacia los demás",
          "Porque solo aplican a los funcionarios públicos",
        ],
        correctIndex: 1,
      },
      {
        text: "¿Cuál de las siguientes es una responsabilidad ciudadana básica?",
        options: [
          "Pagar impuestos y respetar las leyes",
          "Afiliarse a un partido político",
          "Tener un cargo de elección popular",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    // Conciencia de Clase y Compromiso Social → "Compromiso social en la práctica"
    lessonTitle: "Compromiso social en la práctica",
    questions: [
      {
        text: "El compromiso social cotidiano se expresa sobre todo mediante...",
        options: [
          "Grandes donativos únicos",
          "Acciones de solidaridad sostenidas en el tiempo, dentro de la comunidad",
          "Publicaciones en redes sociales",
        ],
        correctIndex: 1,
      },
      {
        text: "La conciencia de clase, tal como se plantea en esta lección, ayuda principalmente a...",
        options: [
          "Ignorar las desigualdades sociales",
          "Reconocer dinámicas de desigualdad y actuar de forma colectiva frente a ellas",
          "Competir individualmente por mejores oportunidades",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    // Los Derechos Laborales → "Salario y prestaciones"
    lessonTitle: "Salario y prestaciones",
    questions: [
      {
        text: "Las prestaciones laborales obligatorias existen para...",
        options: [
          "Ser un beneficio opcional que el patrón otorga si lo desea",
          "Garantizar condiciones económicas mínimas más allá del salario base",
          "Sustituir el pago del salario",
        ],
        correctIndex: 1,
      },
      {
        text: "Si un contrato no menciona una prestación de ley, ¿qué ocurre?",
        options: [
          "La prestación deja de aplicar",
          "La ley la garantiza igual, sin importar lo que diga el contrato",
          "Se debe negociar desde cero",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    // Fiscalía y Acceso a la Justicia → "Presentar una denuncia"
    lessonTitle: "Presentar una denuncia",
    questions: [
      {
        text: "¿Qué es indispensable llevar al presentar una denuncia?",
        options: [
          "Identificación oficial y el relato claro de los hechos",
          "Un abogado obligatoriamente",
          "El nombre del juez que llevará el caso",
        ],
        correctIndex: 0,
      },
      {
        text: "Después de presentar una denuncia, ¿qué le corresponde a la persona denunciante?",
        options: [
          "No puede volver a saber nada del caso",
          "Dar seguimiento al proceso ante el Ministerio Público",
          "Resolver el caso por su cuenta",
        ],
        correctIndex: 1,
      },
    ],
  },
];

async function main() {
  console.log("⏳ Seeding checkpoint quizzes...");

  for (const q of quizzes) {
    const lesson = await prisma.courseLesson.findFirst({
      where: { title: q.lessonTitle },
    });

    if (!lesson) {
      console.log(`⚠️  Lesson not found, skipping: ${q.lessonTitle}`);
      continue;
    }

    await prisma.courseLesson.update({
      where: { id: lesson.id },
      data: { isCheckpoint: true },
    });

    await prisma.quiz.upsert({
      where: { lessonId: lesson.id },
      update: { questions: q.questions as any },
      create: { lessonId: lesson.id, questions: q.questions as any },
    });

    console.log(`✅ ${q.lessonTitle} (${q.questions.length} preguntas)`);
  }

  console.log("🎉 Quizzes ready.");
}

main()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
