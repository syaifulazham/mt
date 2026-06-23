-- CreateTable
CREATE TABLE "team_drone_access" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "droneUserId" TEXT NOT NULL,
    "dronePassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_drone_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_drone_access_teamId_key" ON "team_drone_access"("teamId");

-- AddForeignKey
ALTER TABLE "team_drone_access" ADD CONSTRAINT "team_drone_access_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
