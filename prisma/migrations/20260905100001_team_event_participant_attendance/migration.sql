-- CreateTable
CREATE TABLE IF NOT EXISTS "team_event_participant_attendance" (
    "teamEventId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "attendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_event_participant_attendance_pkey" PRIMARY KEY ("teamEventId", "participantId")
);

-- AddForeignKey
ALTER TABLE "team_event_participant_attendance" ADD CONSTRAINT "team_event_participant_attendance_teamEventId_fkey" FOREIGN KEY ("teamEventId") REFERENCES "team_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_participant_attendance" ADD CONSTRAINT "team_event_participant_attendance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
