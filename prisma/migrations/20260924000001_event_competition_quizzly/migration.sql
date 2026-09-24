-- Asia Spark Quizzly configuration per event-competition.
--
-- `quizzlyQuizMap` holds one row per assignment:
--   [{ targetGroupId, targetGroupName, grade, quizId, quizTitle }]
-- `grade` is null when quizzes are assigned per target group, and a class-grade
-- value ("Darjah 1", "Tingkatan 3", …) when assigned per grade.
ALTER TABLE "event_competitions" ADD COLUMN     "quizzlySessionId" TEXT,
                                ADD COLUMN     "quizzlySessionTitle" TEXT,
                                ADD COLUMN     "quizzlyAssignBy" TEXT,
                                ADD COLUMN     "quizzlyQuizMap" JSONB;
