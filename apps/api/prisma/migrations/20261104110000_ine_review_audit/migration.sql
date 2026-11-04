-- Record who reviewed a government ID, when, and why.

-- AlterTable
ALTER TABLE "INEVerification" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

