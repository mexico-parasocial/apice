/**
 * Seed script for Ápice sample courses.
 *
 * Run with:
 *   npx ts-node scripts/seed-courses.ts
 */

import { prisma } from "../utils/db";

const placeholderThumb = {
  public_id: "apice/seed/placeholder-thumb",
  url: "https://placehold.co/600x400/2563eb/ffffff?text=%C3%81pice",
};

// Videos: se vinculan después de subir contenido real al nodo Streamplace
// (admin → "Subir video nuevo"). Para demos locales sube
// server/fixtures/videos/TESTCLIP.MP4 y pasa el AT URI resultante:
//   SEED_VIDEO_URL="at://did:.../place.stream.video/..." npx ts-node scripts/seed-courses.ts
// Sin video, las lecciones quedan como "sin video" (estado válido) en vez de
// apuntar a un placeholder de YouTube.
const demoVideoUrl: string | null = process.env.SEED_VIDEO_URL || null;
const demoCourseUrl: string = process.env.SEED_VIDEO_URL ?? "";

const courses = [
  {
    name: "Fundamentos de Participación Cívica",
    description:
      "Aprende los principios básicos de la ciudadanía, la democracia participativa y cómo ejercer tus derechos de manera informada.",
    categories: "Civismo",
    tags: "ciudadanía, democracia, derechos, participación",
    level: "Principiante",
    price: 0,
    estimatedPrice: 0,
    demoUrl: demoCourseUrl,
    thumbnail: placeholderThumb,
    benefits: [
      { title: "Comprende tu rol como ciudadano" },
      { title: "Conoce los canales de participación ciudadana" },
      { title: "Desarrolla pensamiento crítico sobre políticas públicas" },
    ],
    prerequisites: [
      { title: "No se requieren conocimientos previos" },
    ],
    sections: [
      {
        title: "Bienvenida y contexto",
        order: 0,
        lessons: [
          {
            title: "¿Qué es la participación cívica?",
            description: "Introducción al curso y a la importancia de participar en la vida pública.",
            videoUrl: demoVideoUrl,
            videoLength: 240,
            order: 0,
            isPreview: true,
            isCheckpoint: false,
          },
          {
            title: "Derechos y deberes ciudadanos",
            description: "Repaso de los derechos políticos y las responsabilidades ciudadanas.",
            videoUrl: demoVideoUrl,
            videoLength: 360,
            order: 1,
            isPreview: false,
            isCheckpoint: false,
          },
        ],
      },
      {
        title: "Mecanismos de participación",
        order: 1,
        lessons: [
          {
            title: "Voto y representación",
            description: "Cómo funciona el voto, las elecciones y la representación política.",
            videoUrl: demoVideoUrl,
            videoLength: 480,
            order: 0,
            isPreview: false,
            isCheckpoint: false,
          },
          {
            title: "Consulta ciudadana",
            description: "Mecanismos de consulta pública y presupuesto participativo.",
            videoUrl: demoVideoUrl,
            videoLength: 420,
            order: 1,
            isPreview: false,
            isCheckpoint: true,
          },
        ],
      },
    ],
  },
  {
    name: "Derechos y Deberes Ciudadanos",
    description:
      "Un recorrido práctico por los derechos humanos, las garantías individuales y las obligaciones que tenemos como miembros de una sociedad.",
    categories: "Derechos",
    tags: "derechos humanos, garantías, obligaciones, constitución",
    level: "Intermedio",
    price: 199,
    estimatedPrice: 399,
    demoUrl: demoCourseUrl,
    thumbnail: placeholderThumb,
    benefits: [
      { title: "Identifica tus derechos fundamentales" },
      { title: "Conoce los mecanismos de protección" },
      { title: "Relaciona derechos con responsabilidades" },
    ],
    prerequisites: [
      { title: "Haber completado 'Fundamentos de Participación Cívica' (recomendado)" },
    ],
    sections: [
      {
        title: "Marco constitucional",
        order: 0,
        lessons: [
          {
            title: "Constitución y ciudadanía",
            description: "Principios constitucionales que definen los derechos y deberes.",
            videoUrl: demoVideoUrl,
            videoLength: 300,
            order: 0,
            isPreview: true,
            isCheckpoint: false,
          },
          {
            title: "Derechos humanos universales",
            description: "Origen y alcance de los derechos humanos.",
            videoUrl: demoVideoUrl,
            videoLength: 540,
            order: 1,
            isPreview: false,
            isCheckpoint: false,
          },
        ],
      },
      {
        title: "Aplicación práctica",
        order: 1,
        lessons: [
          {
            title: "Defensa de tus derechos",
            description: "Instancias y procedimientos para defender tus derechos.",
            videoUrl: demoVideoUrl,
            videoLength: 600,
            order: 0,
            isPreview: false,
            isCheckpoint: false,
          },
          {
            title: "Responsabilidades ciudadanas",
            description: "Deberes que equilibran el ejercicio de nuestros derechos.",
            videoUrl: demoVideoUrl,
            videoLength: 480,
            order: 1,
            isPreview: false,
            isCheckpoint: true,
          },
        ],
      },
    ],
  },
  // ─── Optativos (short elective courses) ────────────────────────────────
  {
    name: "Conciencia de Clase y Compromiso Social",
    description:
      "Reflexiona sobre las desigualdades sociales, la solidaridad de clase y cómo construir compromisos colectivos.",
    categories: "Optativo",
    tags: "optativo, clase social, compromiso, desigualdad",
    level: "Optativo",
    price: 0,
    estimatedPrice: 0,
    demoUrl: demoCourseUrl,
    thumbnail: placeholderThumb,
    benefits: [
      { title: "Identifica dinámicas de desigualdad" },
      { title: "Desarrolla compromiso social" },
    ],
    prerequisites: [{ title: "Ninguno" }],
    sections: [
      {
        title: "Raíces de la conciencia de clase",
        order: 0,
        lessons: [
          {
            title: "¿Qué es la conciencia de clase?",
            description: "Definición y contexto histórico.",
            videoUrl: demoVideoUrl,
            videoLength: 300,
            order: 0,
            isPreview: true,
            isCheckpoint: false,
          },
          {
            title: "Compromiso social en la práctica",
            description: "Acciones cotidianas de solidaridad.",
            videoUrl: demoVideoUrl,
            videoLength: 360,
            order: 1,
            isPreview: false,
            isCheckpoint: true,
          },
        ],
      },
    ],
  },
  {
    name: "Los Derechos Laborales",
    description:
      "Conoce tus derechos laborales básicos, contratos, jornada, salario y mecanismos de defensa.",
    categories: "Optativo",
    tags: "optativo, derechos laborales, trabajo, ley",
    level: "Optativo",
    price: 0,
    estimatedPrice: 0,
    demoUrl: demoCourseUrl,
    thumbnail: placeholderThumb,
    benefits: [
      { title: "Reconoce derechos laborales" },
      { title: "Aprende a leer un contrato" },
    ],
    prerequisites: [{ title: "Ninguno" }],
    sections: [
      {
        title: "Fundamentos laborales",
        order: 0,
        lessons: [
          {
            title: "Contratos y jornada",
            description: "Tipos de contratos y límites de jornada.",
            videoUrl: demoVideoUrl,
            videoLength: 300,
            order: 0,
            isPreview: true,
            isCheckpoint: false,
          },
          {
            title: "Salario y prestaciones",
            description: "Derechos económicos y beneficios obligatorios.",
            videoUrl: demoVideoUrl,
            videoLength: 360,
            order: 1,
            isPreview: false,
            isCheckpoint: true,
          },
        ],
      },
    ],
  },
  {
    name: "Fiscalía y Acceso a la Justicia",
    description:
      "Aprende cómo funciona el Ministerio Público, cómo presentar una denuncia y qué esperar del proceso.",
    categories: "Optativo",
    tags: "optativo, fiscalía, justicia, denuncia",
    level: "Optativo",
    price: 0,
    estimatedPrice: 0,
    demoUrl: demoCourseUrl,
    thumbnail: placeholderThumb,
    benefits: [
      { title: "Conoce el rol del Ministerio Público" },
      { title: "Aprende a presentar una denuncia" },
    ],
    prerequisites: [{ title: "Ninguno" }],
    sections: [
      {
        title: "El camino a la justicia",
        order: 0,
        lessons: [
          {
            title: "¿Qué hace la fiscalía?",
            description: "Funciones y estructura del Ministerio Público.",
            videoUrl: demoVideoUrl,
            videoLength: 300,
            order: 0,
            isPreview: true,
            isCheckpoint: false,
          },
          {
            title: "Presentar una denuncia",
            description: "Requisitos, canales y seguimiento.",
            videoUrl: demoVideoUrl,
            videoLength: 360,
            order: 1,
            isPreview: false,
            isCheckpoint: true,
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log("⏳ Seeding Ápice courses...");

  for (const courseInput of courses) {
    const { sections, ...courseData } = courseInput;

    const existing = await prisma.course.findFirst({
      where: { name: courseData.name },
    });
    if (existing) {
      console.log(`⚠️  Course already exists: ${courseData.name}`);
      continue;
    }

    const course = await prisma.course.create({
      data: {
        ...courseData,
        sections: {
          create: sections.map((section) => ({
            title: section.title,
            order: section.order,
            lessons: {
              create: section.lessons.map((lesson) => ({
                title: lesson.title,
                description: lesson.description,
                videoUrl: lesson.videoUrl,
                videoLength: lesson.videoLength,
                order: lesson.order,
                isPreview: lesson.isPreview,
                isCheckpoint: lesson.isCheckpoint,
              })),
            },
          })),
        },
      },
      include: { sections: { include: { lessons: true } } },
    });

    console.log(
      `✅ Created course: ${course.name} (${course.sections.length} sections, ${course.sections.reduce(
        (acc, s) => acc + s.lessons.length,
        0
      )} lessons)`
    );
  }

  console.log("🎉 Seeding complete.");
}

main()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
