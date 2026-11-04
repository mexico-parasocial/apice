-- Separate the staff activity feed from learners' inboxes.
--
-- Until now both lived in one stream keyed only by userId, and the staff
-- notices ("New Question Received", "New Review Received", "New Order") were
-- written with the *learner's* userId — so they showed up in the learner's
-- own inbox, and the admin feed listed every learner's personal notices.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'admin';

-- The only learner-facing notice the server has ever written.
UPDATE "Notification" SET "audience" = 'user' WHERE "title" LIKE '¡Programa completado!%';

-- CreateIndex
CREATE INDEX "Notification_audience_idx" ON "Notification"("audience");
