-- Live video and replays per duel session (Cloudflare Stream).

-- AlterTable
ALTER TABLE "duel_sessions" ADD COLUMN "streamInputId" TEXT,
ADD COLUMN "streamPublishUrl" TEXT,
ADD COLUMN "streamPlaybackUrl" TEXT,
ADD COLUMN "streamHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "replayVideoId" TEXT,
ADD COLUMN "replayStatus" TEXT,
ADD COLUMN "replayUrl" TEXT;
