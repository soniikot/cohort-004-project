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
  createQuiz,
  getQuizById,
  getQuizByLessonId,
  getQuizWithQuestions,
  updateQuiz,
  deleteQuiz,
  createQuestion,
  getQuestionById,
  getQuestionsByQuiz,
  getQuestionCount,
  updateQuestion,
  deleteQuestion,
  moveQuestionToPosition,
  reorderQuestions,
  createOption,
  getOptionById,
  getOptionsByQuestion,
  updateOption,
  deleteOption,
  recordAttempt,
  getAttemptById,
  getAttemptsByUser,
  getAttemptCountForQuiz,
  getBestAttempt,
  getLatestAttempt,
  recordAnswer,
  getAnswersByAttempt,
  getAttemptWithAnswers,
} from "./quizService";

// Create a lesson under the seeded course and return its id.
function createLesson(): number {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
}

describe("quizService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("quiz CRUD", () => {
    it("creates and fetches a quiz", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz 1", passingScore: 0.7 });

      expect(quiz.id).toBeDefined();
      expect(getQuizById(quiz.id)?.title).toBe("Quiz 1");
      expect(getQuizByLessonId(lessonId)?.id).toBe(quiz.id);
    });

    it("updates only the provided fields", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Original", passingScore: 0.5 });

      const updated = updateQuiz(quiz.id, "Renamed", null);
      expect(updated?.title).toBe("Renamed");
      expect(updated?.passingScore).toBe(0.5);
    });

    it("deletes a quiz and cascades to its questions and options", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const question = createQuestion(
        quiz.id,
        "Q?",
        schema.QuestionType.MultipleChoice,
        null
      );
      createOption(question.id, "A", true);

      deleteQuiz(quiz.id);

      expect(getQuizById(quiz.id)).toBeUndefined();
      expect(getQuestionsByQuiz(quiz.id)).toHaveLength(0);
      expect(getOptionsByQuestion(question.id)).toHaveLength(0);
    });

    it("returns the quiz with nested questions and options", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const question = createQuestion(
        quiz.id,
        "Q?",
        schema.QuestionType.MultipleChoice,
        null
      );
      createOption(question.id, "A", true);
      createOption(question.id, "B", false);

      const full = getQuizWithQuestions(quiz.id);
      expect(full?.questions).toHaveLength(1);
      expect(full?.questions[0].options).toHaveLength(2);
    });
  });

  describe("question management", () => {
    it("auto-assigns sequential positions when none is given", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });

      const q1 = createQuestion(quiz.id, "Q1", schema.QuestionType.TrueFalse, null);
      const q2 = createQuestion(quiz.id, "Q2", schema.QuestionType.TrueFalse, null);

      expect(q1.position).toBe(1);
      expect(q2.position).toBe(2);
      expect(getQuestionCount(quiz.id)).toBe(2);
    });

    it("updates and deletes questions", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const q = createQuestion(quiz.id, "Q1", schema.QuestionType.TrueFalse, null);

      const updated = updateQuestion(q.id, "Q1 edited", null);
      expect(updated?.questionText).toBe("Q1 edited");
      expect(getQuestionById(q.id)?.questionText).toBe("Q1 edited");

      deleteQuestion(q.id);
      expect(getQuestionById(q.id)).toBeUndefined();
    });

    it("moves a question to a new position", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const q1 = createQuestion(quiz.id, "Q1", schema.QuestionType.TrueFalse, null);
      const q2 = createQuestion(quiz.id, "Q2", schema.QuestionType.TrueFalse, null);
      const q3 = createQuestion(quiz.id, "Q3", schema.QuestionType.TrueFalse, null);

      moveQuestionToPosition({ questionId: q3.id, newPosition: 1 });

      const ordered = getQuestionsByQuiz(quiz.id).map((q) => q.id);
      expect(ordered).toEqual([q3.id, q1.id, q2.id]);
    });

    it("reorders questions to match an explicit id ordering", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const q1 = createQuestion(quiz.id, "Q1", schema.QuestionType.TrueFalse, null);
      const q2 = createQuestion(quiz.id, "Q2", schema.QuestionType.TrueFalse, null);

      reorderQuestions(quiz.id, [q2.id, q1.id]);

      const ordered = getQuestionsByQuiz(quiz.id).map((q) => q.id);
      expect(ordered).toEqual([q2.id, q1.id]);
    });
  });

  describe("option management", () => {
    it("creates, updates and deletes options", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const q = createQuestion(quiz.id, "Q1", schema.QuestionType.MultipleChoice, null);

      const opt = createOption(q.id, "A", false);
      expect(getOptionById(opt.id)?.optionText).toBe("A");

      const updated = updateOption(opt.id, "A edited", true);
      expect(updated?.optionText).toBe("A edited");
      expect(updated?.isCorrect).toBe(true);

      deleteOption(opt.id);
      expect(getOptionById(opt.id)).toBeUndefined();
    });
  });

  describe("attempt recording", () => {
    it("records an attempt and counts it", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });

      const attempt = recordAttempt({
        userId: base.user.id,
        quizId: quiz.id,
        score: 0.8,
        passed: true,
      });

      expect(getAttemptById(attempt.id)?.score).toBe(0.8);
      expect(getAttemptCountForQuiz(quiz.id)).toBe(1);
      expect(getAttemptsByUser({ userId: base.user.id, quizId: quiz.id })).toHaveLength(1);
    });

    it("returns the best attempt by score", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });

      recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 0.4, passed: false });
      recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 0.9, passed: true });
      recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 0.6, passed: false });

      expect(getBestAttempt({ userId: base.user.id, quizId: quiz.id })?.score).toBe(0.9);
    });

    it("returns a latest attempt for the user", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });

      recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 0.5, passed: false });
      const latest = getLatestAttempt({ userId: base.user.id, quizId: quiz.id });
      expect(latest).toBeDefined();
      expect(latest?.quizId).toBe(quiz.id);
    });

    it("records answers and returns the attempt with its answers", () => {
      const lessonId = createLesson();
      const quiz = createQuiz({ lessonId, title: "Quiz", passingScore: 0.7 });
      const q = createQuestion(quiz.id, "Q1", schema.QuestionType.MultipleChoice, null);
      const opt = createOption(q.id, "A", true);

      const attempt = recordAttempt({
        userId: base.user.id,
        quizId: quiz.id,
        score: 1,
        passed: true,
      });
      recordAnswer({
        attemptId: attempt.id,
        questionId: q.id,
        selectedOptionId: opt.id,
      });

      expect(getAnswersByAttempt(attempt.id)).toHaveLength(1);
      expect(getAttemptWithAnswers(attempt.id)?.answers).toHaveLength(1);
    });
  });
});
