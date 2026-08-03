import { useState } from "react";
import { reviewQuestion, type Question } from "../../api/learningApi";

type QuestionsPanelProps = {
  questions: Question[];
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
  onQuestionUpdated: (questionId: string, changes: Partial<Question>) => void;
  onMessage: (message: string) => void;
};

export function QuestionsPanel({
  questions,
  isGenerating,
  onGenerate,
  onQuestionUpdated,
  onMessage,
}: QuestionsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [difficulty, setDifficulty] = useState(3);
  const [isUpdating, setIsUpdating] = useState(false);
  const activeQuestions = questions.filter(
    (question) => question.status !== "retired",
  );

  const updateQuestion = async (
    questionId: string,
    action: "approve" | "edit" | "retire",
  ) => {
    setIsUpdating(true);
    try {
      await reviewQuestion(
        questionId,
        action === "edit"
          ? { action, question_text: questionText, difficulty }
          : { action },
      );
      setEditingId(null);
      onQuestionUpdated(questionId, {
        ...(action === "edit" ? { question_text: questionText, difficulty } : {}),
        status: action === "approve" ? "approved" : action === "retire" ? "retired" : "edited",
      });
      onMessage(
        `Question ${action === "approve" ? "approved" : action === "retire" ? "retired" : "updated"}.`,
      );
    } catch {
      onMessage("Unable to update this question.");
    } finally {
      setIsUpdating(false);
    }
  };

  const startEditing = (question: Question) => {
    setEditingId(question.id);
    setQuestionText(question.question_text);
    setDifficulty(question.difficulty);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            QUESTION REVIEW
          </p>
          <h2 className="mt-1 text-2xl font-bold">Practice questions</h2>
          <p className="mt-2 text-sm text-slate-600">
            Generate suggestions, then approve, edit, or retire each question.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isGenerating}
            onClick={() => void onGenerate()}
            type="button"
          >
            Generate questions
          </button>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {activeQuestions.length ? (
          activeQuestions.map((question) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5"
              key={question.id}
            >
              {editingId === question.id ? (
                <>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    onChange={(event) => setQuestionText(event.target.value)}
                    value={questionText}
                  />
                  <label className="mt-3 block text-sm font-medium text-slate-600">
                    Difficulty{" "}
                    <select
                      className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
                      onChange={(event) =>
                        setDifficulty(Number(event.target.value))
                      }
                      value={difficulty}
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
                      disabled={isUpdating}
                      onClick={() => void updateQuestion(question.id, "edit")}
                      type="button"
                    >
                      Save changes
                    </button>
                    <button
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500"
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
                    {question.concept_title} · {question.question_type} · Level{" "}
                    {question.difficulty}
                  </p>
                  <h3 className="mt-2 font-semibold">
                    {question.question_text}
                  </h3>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="mr-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {question.status}
                    </span>
                    {question.status === "generated" && (
                      <button
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={isUpdating}
                        onClick={() =>
                          void updateQuestion(question.id, "approve")
                        }
                        type="button"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                      onClick={() => startEditing(question)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600"
                      disabled={isUpdating}
                      onClick={() => void updateQuestion(question.id, "retire")}
                      type="button"
                    >
                      Retire
                    </button>
                  </div>
                </>
              )}
            </article>
          ))
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">
            Accept or edit concepts, then generate the first question set.
          </p>
        )}
      </div>
    </div>
  );
}
