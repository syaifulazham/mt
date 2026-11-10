-- CreateTable
CREATE TABLE "team_webcraft_access" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "webcraftUserId" TEXT NOT NULL,
    "webcraftPassword" TEXT NOT NULL,
    "sourceParticipantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_webcraft_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_webcraft_access_teamId_key" ON "team_webcraft_access"("teamId");

-- AddForeignKey
ALTER TABLE "team_webcraft_access" ADD CONSTRAINT "team_webcraft_access_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
