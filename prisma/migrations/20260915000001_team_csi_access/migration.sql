-- CreateTable
CREATE TABLE "team_csi_access" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "csiUserId" TEXT NOT NULL,
    "csiPassword" TEXT NOT NULL,
    "csiAlias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_csi_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_csi_access_teamId_key" ON "team_csi_access"("teamId");

-- AddForeignKey
ALTER TABLE "team_csi_access" ADD CONSTRAINT "team_csi_access_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
