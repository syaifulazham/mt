-- Live scoreboard paging: names per screen and seconds per page.
ALTER TABLE "walkin_scoreboard_endpoints" ADD COLUMN "pageSize" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "walkin_scoreboard_endpoints" ADD COLUMN "pageSeconds" INTEGER NOT NULL DEFAULT 10;
