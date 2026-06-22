import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  getScore,
  computeResult,
  calculateGrade,
  renderQuizResults,
  getQuizStats,
  getUserQuizHistory,
} from "./quizScoringService";

type SetupQuiz = {
  quizId: number;
  q1: number;
  q1Correct: number;
  q1Wrong: number;
  q2: number;
  q2Correct: number;
  q2Wrong: number;
};

// Build a quiz with one multiple-choice and one true/false question,
// each with a correct and an incorrect option.
function setupQuiz(): SetupQuiz {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get();
  const quiz = testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: "Quiz", passingScore: 0.7 })
    .returning()
    .get();

  const q1 = testDb
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "MC question",
      questionType: schema.QuestionType.MultipleChoice,
      position: 1,
    })
    .returning()
    .get();
  const q1Correct = testDb
    .insert(schema.quizOptions)
    .values({ questionId: q1.id, optionText: "Right", isCorrect: true })
    .returning()
    .get();
  const q1Wrong = testDb
    .insert(schema.quizOptions)
    .values({ questionId: q1.id, optionText: "Wrong", isCorrect: false })
    .returning()
    .get();

  const q2 = testDb
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "TF question",
      questionType: schema.QuestionType.TrueFalse,
      position: 2,
    })
    .returning()
    .get();
  const q2Correct = testDb
    .insert(schema.quizOptions)
    .values({ questionId: q2.id, optionText: "True", isCorrect: true })
    .returning()
    .get();
  const q2Wrong = testDb
    .insert(schema.quizOptions)
    .values({ questionId: q2.id, optionText: "False", isCorrect: false })
    .returning()
    .get();

  return {
    quizId: quiz.id,
    q1: q1.id,
    q1Correct: q1Correct.id,
    q1Wrong: q1Wrong.id,
    q2: q2.id,
    q2Correct: q2Correct.id,
    q2Wrong: q2Wrong.id,
  };
}

// Insert quiz attempts directly for stats/history tests.
function recordAttempts(
  quizId: number,
  attempts: { userId: number; score: number; passed: boolean }[]
) {
  for (const a of attempts) {
    testDb
      .insert(schema.quizAttempts)
      .values({ userId: a.userId, quizId, score: a.score, passed: a.passed })
      .run();
  }
}

describe("quizScoringService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("calculateGrade", () => {
    it("maps scores to letter grades", () => {
      expect(calculateGrade(0.95)).toBe("A");
      expect(calculateGrade(0.85)).toBe("B");
      expect(calculateGrade(0.75)).toBe("C");
      expect(calculateGrade(0.65)).toBe("D");
      expect(calculateGrade(0.5)).toBe("F");
    });
  });

  describe("renderQuizResults", () => {
    it("computes percentage, grade and a passing message", () => {
      const result = renderQuizResults({
        score: 9,
        total: 10,
        passed: true,
        showAnswers: true,
        showExplanations: false,
      });

      expect(result.percentage).toBe(0.9);
      expect(result.grade).toBe("A");
      expect(result.passed).toBe(true);
      expect(result.message).toContain("passed");
      expect(result.showAnswers).toBe(true);
      expect(result.showExplanations).toBeUndefined();
    });

    it("reports a failing message when not passed", () => {
      const result = renderQuizResults({
        score: 3,
        total: 10,
        passed: false,
        showAnswers: false,
        showExplanations: false,
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain("did not pass");
    });
  });

  describe("getScore", () => {
    it("scores a fully correct submission", () => {
      const q = setupQuiz();

      const result = getScore({
        quizId: q.quizId,
        answers: [
          { questionId: q.q1, selectedOptionId: q.q1Correct },
          { questionId: q.q2, selectedOptionId: q.q2Correct },
        ],
      });

      expect(result.totalCorrect).toBe(2);
      expect(result.totalQuestions).toBe(2);
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.grade).toBe("A");
    });

    it("scores a partially correct submission", () => {
      const q = setupQuiz();

      const result = getScore({
        quizId: q.quizId,
        answers: [
          { questionId: q.q1, selectedOptionId: q.q1Correct },
          { questionId: q.q2, selectedOptionId: q.q2Wrong },
        ],
      });

      expect(result.totalCorrect).toBe(1);
      expect(result.score).toBe(0.5);
      expect(result.passed).toBe(false);
    });

    it("returns a failing result for an unknown quiz", () => {
      const result = getScore({ quizId: 9999, answers: [] });
      expect(result.passed).toBe(false);
      expect(result.grade).toBe("F");
    });
  });

  describe("computeResult", () => {
    it("scores answers and persists an attempt", () => {
      const q = setupQuiz();

      const result = computeResult({
        userId: base.user.id,
        quizId: q.quizId,
        selectedAnswers: {
          [q.q1]: q.q1Correct,
          [q.q2]: q.q2Correct,
        },
      });

      expect(result).not.toBeNull();
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.grade).toBe("A");
      expect(result.totalCorrect).toBe(2);
      expect(result.questionResults).toHaveLength(2);

      // A persisted attempt should now exist for this user/quiz.
      const attempts = testDb
        .select()
        .from(schema.quizAttempts)
        .all();
      expect(attempts).toHaveLength(1);
      expect(attempts[0].id).toBe(result.attemptId);
    });

    it("returns null for an unknown quiz", () => {
      expect(
        computeResult({ userId: base.user.id, quizId: 9999, selectedAnswers: {} })
      ).toBeNull();
    });
  });

  describe("getQuizStats", () => {
    it("aggregates attempt statistics for a quiz", () => {
      const q = setupQuiz();
      recordAttempts(q.quizId, [
        { userId: base.user.id, score: 0.4, passed: false },
        { userId: base.user.id, score: 0.9, passed: true },
        { userId: base.user.id, score: 0.6, passed: false },
      ]);

      const stats = getQuizStats(q.quizId);
      expect(stats.totalAttempts).toBe(3);
      expect(stats.highScore).toBe(0.9);
      expect(stats.lowScore).toBe(0.4);
      expect(stats.averageScore).toBeCloseTo(0.6333, 3);
      expect(stats.passRate).toBeCloseTo(1 / 3, 5);
    });

    it("returns zeroed stats when there are no attempts", () => {
      const q = setupQuiz();
      const stats = getQuizStats(q.quizId);
      expect(stats).toEqual({
        totalAttempts: 0,
        averageScore: 0,
        highScore: 0,
        lowScore: 0,
        passRate: 0,
      });
    });
  });

  describe("getUserQuizHistory", () => {
    it("returns the user's attempts with computed grades", () => {
      const q = setupQuiz();
      recordAttempts(q.quizId, [
        { userId: base.user.id, score: 0.95, passed: true },
        { userId: base.user.id, score: 0.55, passed: false },
      ]);

      const history = getUserQuizHistory({
        userId: base.user.id,
        quizId: q.quizId,
      });

      expect(history).toHaveLength(2);
      const grades = history.map((h) => h.grade).sort();
      expect(grades).toEqual(["A", "F"]);
      expect(typeof history[0].passed).toBe("boolean");
    });

    it("excludes attempts from other users", () => {
      const q = setupQuiz();
      const other = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      recordAttempts(q.quizId, [
        { userId: base.user.id, score: 0.8, passed: true },
        { userId: other.id, score: 0.2, passed: false },
      ]);

      const history = getUserQuizHistory({
        userId: base.user.id,
        quizId: q.quizId,
      });
      expect(history).toHaveLength(1);
    });
  });
});
