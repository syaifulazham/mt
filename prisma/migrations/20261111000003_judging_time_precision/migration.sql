-- TIME criteria can record fractions of a second (1/100 s or ms).
ALTER TABLE "judging_criterions" ALTER COLUMN "maxTime" TYPE DOUBLE PRECISION;
ALTER TABLE "judging_criterions" ADD COLUMN "timePrecision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "judging_scores" ALTER COLUMN "timeSeconds" TYPE DOUBLE PRECISION;
ALTER TABLE "walkin_judging_scores" ALTER COLUMN "timeSeconds" TYPE DOUBLE PRECISION;
