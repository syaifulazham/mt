-- CreateEnum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailBlastStatus') THEN
    CREATE TYPE "EmailBlastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED');
  END IF;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "email_blasts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "htmlBody" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EmailBlastStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_blasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_blast_recipients" (
    "id" TEXT NOT NULL,
    "blastId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_blast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "email_blast_recipients_blastId_email_key" ON "email_blast_recipients"("blastId", "email");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'email_blasts_createdById_fkey'
  ) THEN
    ALTER TABLE "email_blasts" ADD CONSTRAINT "email_blasts_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "organizer_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'email_blast_recipients_blastId_fkey'
  ) THEN
    ALTER TABLE "email_blast_recipients" ADD CONSTRAINT "email_blast_recipients_blastId_fkey"
      FOREIGN KEY ("blastId") REFERENCES "email_blasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
