-- Dashboard "Stats Snapshot": frozen copies of the organizer dashboard.
CREATE TABLE "dashboard_snapshots" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BUILDING',
    "parts" JSONB NOT NULL DEFAULT '{}',
    "partCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "dashboard_snapshots_pkey" PRIMARY KEY ("id")
);
