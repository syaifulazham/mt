-- Certificates: the recipient's country, frozen into the snapshot like the
-- state (for international results and foreign recipients). Plain column, no
-- foreign key — see the archival contract in AGENTS.md. Hand-scoped.
ALTER TABLE "certificates" ADD COLUMN "countryName" TEXT;
