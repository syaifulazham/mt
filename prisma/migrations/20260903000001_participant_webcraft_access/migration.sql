-- CreateTable
CREATE TABLE "participant_webcraft_access" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "webcraftUserId" TEXT NOT NULL,
    "webcraftPassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_webcraft_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_webcraft_access_participantId_key" ON "participant_webcraft_access"("participantId");

-- AddForeignKey
ALTER TABLE "participant_webcraft_access" ADD CONSTRAINT "participant_webcraft_access_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
