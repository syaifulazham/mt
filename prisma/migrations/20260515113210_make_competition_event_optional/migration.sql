-- DropForeignKey
ALTER TABLE "competitions" DROP CONSTRAINT "competitions_eventId_fkey";

-- AlterTable
ALTER TABLE "competitions" ALTER COLUMN "eventId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
