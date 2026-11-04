-- Credentials become opt-in and durable; video views stop recording IPs.
--
-- * User.credentialsConsent: app.civic.progress records land in the learner's
--   PUBLIC repo (firehose, relays, archives). Publishing now requires an
--   explicit opt-in. Existing users start at false — they have to choose,
--   which is the point.
-- * CredentialPublication: outbox with status/attempts/backoff, replacing
--   fire-and-forget publishing that silently lost credentials on any error.
-- * VideoView.ip / userAgent: dropped. Per-view IP logs tied to a DID are the
--   opposite of the platform's privacy promise, and nothing read them.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credentialsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "credentialsConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VideoView" DROP COLUMN "ip",
DROP COLUMN "userAgent";

-- CreateTable
CREATE TABLE "CredentialPublication" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "uri" TEXT,
    "cid" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredentialPublication_key_key" ON "CredentialPublication"("key");

-- CreateIndex
CREATE INDEX "CredentialPublication_status_nextAttemptAt_idx" ON "CredentialPublication"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CredentialPublication_userId_idx" ON "CredentialPublication"("userId");

-- CreateIndex
CREATE INDEX "CredentialPublication_courseId_idx" ON "CredentialPublication"("courseId");

-- AddForeignKey
ALTER TABLE "CredentialPublication" ADD CONSTRAINT "CredentialPublication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

