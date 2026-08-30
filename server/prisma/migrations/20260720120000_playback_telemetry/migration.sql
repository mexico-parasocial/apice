-- Lightweight playback telemetry per enrollment-lesson (QoS groundwork).
ALTER TABLE "EnrollmentLesson" ADD COLUMN IF NOT EXISTS "playbackTelemetry" JSONB;
