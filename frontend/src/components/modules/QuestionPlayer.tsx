import { useState } from "react";
import {
  createAttempt,
  endStudySession,
  gradeAttempt,
  type GradeResult,
  type StudyQuestion,
  type StudySession,
} from "../../api/learningApi";

type AttemptSummary = {
  question: StudyQuestion;
  grade: GradeResult;
};

type QuestionPlayerProps = {
  session: StudySession;
  questions: StudyQuestion[];
  onClose: () => void;
};

const parseOptions = (options: StudyQuestion["options"]) => {
  if (Array.isArray(options)) return options;
  if (typeof options !== "string") return [];
  try {
    const parsed = JSON.parse(options);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function QuestionPlayer({
  session,
  questions,
  onClose,
}: QuestionPlayerProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [currentGrade, setCurrentGrade] = useState<GradeResult | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const currentQuestion = questions[questionIndex];
  const score = attempts.reduce(
    (total, attempt) =>
      total +
      (attempt.grade.attempt.result === "correct"
        ? 10
        : attempt.grade.attempt.result === "partial"
          ? 5
          : 0),
    0,
  );

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    setIsSubmitting(true);
    setError("");
    try {
      const attempt = await createAttempt({
        study_session_id: session.id,
        question_id: currentQuestion.id,
        question_version_id: currentQuestion.question_version_id,
        user_answer: answer.trim(),
      });
      setCurrentGrade(await gradeAttempt(attempt.id));
    } catch {
      setError("Unable to grade this answer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToNextQuestion = async () => {
    if (!currentGrade) return;
    const updatedAttempts = [
      ...attempts,
      { question: currentQuestion, grade: currentGrade },
    ];
    setAttempts(updatedAttempts);
    setCurrentGrade(null);
    setAnswer("");
    if (questionIndex === questions.length - 1) {
      await endStudySession(session.id);
      setIsComplete(true);
      return;
    }
    setQuestionIndex((index) => index + 1);
  };

  if (isComplete) {
    const masteredConcepts = attempts.map((attempt) => attempt.grade.mastery);
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold text-indigo-600">
          SESSION COMPLETE
        </p>
        <h2 className="mt-1 text-3xl font-bold">Your results are ready.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <p className="text-sm text-slate-300">Session score</p>
            <p className="mt-1 text-4xl font-bold">
              {score}
              <span className="text-lg text-slate-300">
                / {questions.length * 10}
              </span>
            </p>
          </div>
          <div className="rounded-2xl bg-indigo-50 p-5">
            <p className="text-sm font-semibold text-indigo-700">
              Latest mastery
            </p>
            <p className="mt-1 text-4xl font-bold text-indigo-950">
              {masteredConcepts.at(-1)?.score ?? 0}%
            </p>
            <p className="mt-1 text-sm text-indigo-700">
              {masteredConcepts.at(-1)?.bucket ?? "New"}
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-2">
          {attempts.map((attempt, index) => (
            <div
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"
              key={attempt.grade.attempt.id}
            >
              <span>
                {index + 1}. {attempt.question.concept_title}
              </span>
              <span
                className={
                  attempt.grade.attempt.result === "correct"
                    ? "font-semibold text-emerald-700"
                    : attempt.grade.attempt.result === "partial"
                      ? "font-semibold text-amber-700"
                      : "font-semibold text-rose-700"
                }
              >
                {attempt.grade.attempt.result}
              </span>
            </div>
          ))}
        </div>
        <button
          className="mt-6 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
          onClick={onClose}
          type="button"
        >
          Back to module
        </button>
      </section>
    );
  }

  const options = parseOptions(currentQuestion.options);
  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-500">
        <span>
          Question {questionIndex + 1} of {questions.length}
        </span>
        <span>{currentQuestion.concept_title}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all"
          style={{
            width: `${((questionIndex + 1) / questions.length) * 100}%`,
          }}
        />
      </div>
      <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">
          {currentQuestion.question_type.replace("_", " ")}
        </p>
        <h2 className="mt-3 text-2xl font-bold leading-9">
          {currentQuestion.question_text}
        </h2>
        {currentGrade ? (
          <div
            className={`mt-6 rounded-2xl p-5 ${currentGrade.attempt.result === "correct" ? "bg-emerald-50" : currentGrade.attempt.result === "partial" ? "bg-amber-50" : "bg-rose-50"}`}
          >
            <p className="font-bold capitalize">
              {currentGrade.attempt.result}
            </p>
            <p className="mt-2 text-sm leading-6">
              {currentGrade.attempt.grading_reason}
            </p>
            <p className="mt-3 text-sm font-semibold">
              Mastery: {currentGrade.mastery.score}% ·{" "}
              {currentGrade.mastery.bucket}
            </p>
            <button
              className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
              onClick={() => void goToNextQuestion()}
              type="button"
            >
              {questionIndex === questions.length - 1
                ? "Finish session"
                : "Next question"}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              {options.length ? (
                options.map((option) => (
                  <button
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${answer === option ? "border-indigo-500 bg-indigo-50 text-indigo-950" : "border-slate-200 hover:border-slate-300"}`}
                    key={option}
                    onClick={() => setAnswer(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))
              ) : (
                <textarea
                  className="min-h-36 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-indigo-500"
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Write your answer…"
                  value={answer}
                />
              )}
            </div>
            {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
            <button
              className="mt-6 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting || !answer.trim()}
              onClick={() => void submitAnswer()}
              type="button"
            >
              {isSubmitting ? "Grading…" : "Submit answer"}
            </button>
          </>
        )}
      </article>
    </section>
  );
}
