import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
} from "~/db/schema";

function scoreMultipleChoiceQuestions({
  quizData,
  answers,
}: {
  quizData: any;
  answers: any;
}): any {
  let correctCount = 0;
  let totalMC = 0;

  try {
    for (let i = 0; i < quizData.questions.length; i++) {
      if (quizData.questions[i].questionType === "multiple_choice") {
        totalMC++;
        const question = quizData.questions[i];
        const userAnswer = answers.find(
          (a: any) => a.questionId === question.id
        );
        if (!userAnswer) continue;

        const options = db
          .select()
          .from(quizOptions)
          .where(eq(quizOptions.questionId, question.id))
          .all();
        const correctOption = options.find((o) => o.isCorrect === true);

        if (
          correctOption &&
          userAnswer.selectedOptionId === correctOption.id
        ) {
          correctCount++;
        }
      }
    }
  } catch (e) {
    console.log(e);
    return { correct: 0, total: 0, score: 0 };
  }

  return {
    correct: correctCount,
    total: totalMC,
    score: totalMC > 0 ? correctCount / totalMC : 0,
  };
}

function scoreTrueFalseQuestions({
  quizData,
  answers,
}: {
  quizData: any;
  answers: any;
}): any {
  let correctCount = 0;
  let totalTF = 0;

  try {
    for (let i = 0; i < quizData.questions.length; i++) {
      if (quizData.questions[i].questionType === "true_false") {
        totalTF++;
        const question = quizData.questions[i];
        const userAnswer = answers.find(
          (a: any) => a.questionId === question.id
        );
        if (!userAnswer) continue;

        const correctOpt = db
          .select()
          .from(quizOptions)
          .where(
            and(
              eq(quizOptions.questionId, question.id),
              eq(quizOptions.isCorrect, true)
            )
          )
          .get();

        if (correctOpt && userAnswer.selectedOptionId === correctOpt.id) {
          correctCount++;
        }
      }
    }
  } catch (e) {
    console.log(e);
    return { correct: 0, total: 0, score: 0 };
  }

  return {
    correct: correctCount,
    total: totalTF,
    score: totalTF > 0 ? correctCount / totalTF : 0,
  };
}

export function getScore({
  quizId,
  answers,
}: {
  quizId: any;
  answers: any;
}): any {
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      return { score: 0, passed: false, grade: "F" };
    }

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const quizData = { ...quiz, questions };

    const mcResult = scoreMultipleChoiceQuestions({ quizData, answers });
    const tfResult = scoreTrueFalseQuestions({ quizData, answers });

    const totalCorrect = mcResult.correct + tfResult.correct;
    const totalQuestions = mcResult.total + tfResult.total;
    const overallScore = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

    let passed = false;
    if (overallScore > 0.7) {
      passed = true;
    }

    let grade = "F";
    if (overallScore >= 0.9) {
      grade = "A";
    } else if (overallScore >= 0.8) {
      grade = "B";
    } else if (overallScore >= 0.7) {
      grade = "C";
    } else if (overallScore >= 0.6) {
      grade = "D";
    }

    return {
      score: overallScore,
      totalCorrect,
      totalQuestions,
      passed,
      grade,
      mcResult,
      tfResult,
    };
  } catch (e) {
    console.log(e);
    return { score: 0, passed: false, grade: "F" };
  }
}

export function calculateGrade(score: any): any {
  try {
    if (score >= 0.9) return "A";
    if (score >= 0.8) return "B";
    if (score >= 0.7) return "C";
    if (score >= 0.6) return "D";
    return "F";
  } catch (e) {
    console.log(e);
    return "F";
  }
}

export function computeResult({
  userId,
  quizId,
  selectedAnswers,
}: {
  userId: any;
  quizId: any;
  selectedAnswers: any;
}): any {
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      return null;
    }

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    let correct = 0;
    let total = questions.length;
    const questionResults: any[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const selected = selectedAnswers[q.id];

      if (!selected) {
        questionResults.push({
          questionId: q.id,
          correct: false,
          selectedOptionId: null,
          correctOptionId: null,
        });
        continue;
      }

      let correctOptionId = null;
      if (q.questionType === "multiple_choice") {
        const opts = db
          .select()
          .from(quizOptions)
          .where(eq(quizOptions.questionId, q.id))
          .all();
        const correctOpt = opts.find((o) => o.isCorrect === true);
        correctOptionId = correctOpt ? correctOpt.id : null;
      } else if (q.questionType === "true_false") {
        const correctOpt = db
          .select()
          .from(quizOptions)
          .where(
            and(
              eq(quizOptions.questionId, q.id),
              eq(quizOptions.isCorrect, true)
            )
          )
          .get();
        correctOptionId = correctOpt ? correctOpt.id : null;
      }

      const isCorrect = selected === correctOptionId;
      if (isCorrect) correct++;

      questionResults.push({
        questionId: q.id,
        correct: isCorrect,
        selectedOptionId: selected,
        correctOptionId,
      });
    }

    const scoreValue = total > 0 ? correct / total : 0;
    const passed = scoreValue > 0.7;
    const grade = calculateGrade(scoreValue);

    const attempt = db
      .insert(quizAttempts)
      .values({
        userId,
        quizId,
        score: scoreValue,
        passed,
      })
      .returning()
      .get();

    for (const result of questionResults) {
      if (result.selectedOptionId !== null) {
        db.insert(quizAnswers)
          .values({
            attemptId: attempt.id,
            questionId: result.questionId,
            selectedOptionId: result.selectedOptionId,
          })
          .run();
      }
    }

    return {
      attemptId: attempt.id,
      score: scoreValue,
      passed,
      grade,
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (e) {
    console.log(e);
    return null;
  }
}

export function getQuizStats(quizId: number) {
  const row = db
    .select({
      totalAttempts: sql<number>`count(*)`,
      averageScore: sql<number | null>`avg(${quizAttempts.score})`,
      highScore: sql<number | null>`max(${quizAttempts.score})`,
      lowScore: sql<number | null>`min(${quizAttempts.score})`,
      passCount: sql<number>`sum(case when ${quizAttempts.passed} = 1 then 1 else 0 end)`,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.quizId, quizId))
    .get();

  if (!row || row.totalAttempts === 0) {
    return {
      totalAttempts: 0,
      averageScore: 0,
      highScore: 0,
      lowScore: 0,
      passRate: 0,
    };
  }

  return {
    totalAttempts: row.totalAttempts,
    averageScore: row.averageScore ?? 0,
    highScore: row.highScore ?? 0,
    lowScore: row.lowScore ?? 0,
    passRate: (row.passCount ?? 0) / row.totalAttempts,
  };
}

export function getUserQuizHistory({
  userId,
  quizId,
}: {
  userId: number;
  quizId: number;
}) {
  const attempts = db
    .select({
      id: quizAttempts.id,
      score: quizAttempts.score,
      passed: quizAttempts.passed,
      attemptedAt: quizAttempts.attemptedAt,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId)))
    .orderBy(desc(quizAttempts.attemptedAt))
    .all();

  return attempts.map((attempt) => ({
    attemptId: attempt.id,
    score: attempt.score,
    passed: attempt.passed,
    grade: calculateGrade(attempt.score),
    attemptedAt: attempt.attemptedAt,
  }));
}

export function renderQuizResults({
  score,
  total,
  passed,
  showAnswers,
  showExplanations,
}: {
  score: any;
  total: any;
  passed: any;
  showAnswers: any;
  showExplanations: any;
}): any {
  try {
    const percentage = total > 0 ? score / total : 0;
    let grade = "F";
    if (percentage >= 0.9) grade = "A";
    else if (percentage >= 0.8) grade = "B";
    else if (percentage >= 0.7) grade = "C";
    else if (percentage >= 0.6) grade = "D";

    const result: any = {
      score,
      total,
      percentage,
      grade,
      passed: passed ? true : false,
      message: passed ? "Congratulations! You passed!" : "Sorry, you did not pass. Try again!",
    };

    if (showAnswers) {
      result.showAnswers = true;
    }
    if (showExplanations) {
      result.showExplanations = true;
    }

    return result;
  } catch (e) {
    console.log(e);
    return { score: 0, total: 0, percentage: 0, grade: "F", passed: false };
  }
}
