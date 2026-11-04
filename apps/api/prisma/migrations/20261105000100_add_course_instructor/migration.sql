-- Who teaches a course (all optional).
ALTER TABLE "Course" ADD COLUMN "instructorName" TEXT,
ADD COLUMN "instructorTitle" TEXT,
ADD COLUMN "instructorBio" TEXT,
ADD COLUMN "instructorHandle" TEXT;
