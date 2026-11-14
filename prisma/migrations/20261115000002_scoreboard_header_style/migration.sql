-- Live scoreboard table header: "LABEL" (text) or "ICON".
ALTER TABLE "walkin_scoreboard_endpoints" ADD COLUMN "headerStyle" TEXT NOT NULL DEFAULT 'LABEL';
