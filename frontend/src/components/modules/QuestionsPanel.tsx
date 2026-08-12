import { useEffect, useRef, useState } from "react";
import {
  getQuestionVersions,
  reviewQuestion,
  type Question,
  type QuestionVersion,
} from "../../api/learningApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

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
  const [questionVersions, setQuestionVersions] = useState<
    Record<string, { current_version: number; versions: QuestionVersion[] }>
  >({});
  const [selectedVersion, setSelectedVersion] = useState<Record<string, number>>(
    {},
  );
  const questionListRef = useRef<HTMLDivElement>(null);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(
    null,
  );
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
      let currentVersion: number | undefined;
      if (action === "edit") {
        const history = await getQuestionVersions(questionId);
        currentVersion = history.current_version;
        setQuestionVersions((current) => ({ ...current, [questionId]: history }));
        setSelectedVersion((current) => ({
          ...current,
          [questionId]: history.current_version,
        }));
      }
      setEditingId(null);
      onQuestionUpdated(questionId, {
        ...(action === "edit"
          ? { question_text: questionText, difficulty, current_version: currentVersion }
          : {}),
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

  const loadQuestionVersions = async (questionId: string) => {
    if (questionVersions[questionId]) return;

    try {
      const history = await getQuestionVersions(questionId);
      setQuestionVersions((current) => ({ ...current, [questionId]: history }));
    } catch {
      onMessage("Unable to load question version history.");
    }
  };

  useEffect(() => {
    questions.forEach((question) => void loadQuestionVersions(question.id));
  }, [questions]);

  useEffect(() => {
    setFocusedQuestionId(activeQuestions[0]?.id ?? null);
  }, [questions]);

  const updateFocusedQuestion = () => {
    const list = questionListRef.current;
    if (!list) return;

    const listTop = list.getBoundingClientRect().top;
    const cards = Array.from(
      list.querySelectorAll<HTMLElement>("[data-question-id]"),
    );
    const firstVisibleCard = cards.find(
      (card) => card.getBoundingClientRect().bottom > listTop,
    );

    setFocusedQuestionId(firstVisibleCard?.dataset.questionId ?? null);
  };

  return (
    <div className="flex h-full min-h-0 max-w-4xl flex-col">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            QUESTION REVIEW
          </p>
          <h2 className="mt-1 text-2xl font-bold">Practice questions</h2>
          <p className="mt-2 text-sm text-slate-600">
            Generate suggestions, then approve, edit, or retire each question.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
            disabled={isGenerating}
            onClick={() => void onGenerate()}
            type="button"
          >
            Generate questions
          </button>
        </div>
      </div>
      <div
        className="mt-6 min-h-0 flex-1 snap-y snap-mandatory space-y-5 overflow-y-auto px-2 pt-2 pb-[40vh] sm:px-5"
        onScroll={updateFocusedQuestion}
        ref={questionListRef}
      >
        {activeQuestions.length ? (
          activeQuestions.map((question) => (
            <article
              className={`snap-start snap-always rounded-2xl border bg-white p-4 transition-all duration-300 sm:p-5 ${
                focusedQuestionId === question.id
                  ? "scale-100 border-indigo-200 shadow-lg"
                  : "scale-[0.94] border-slate-200 opacity-55"
              }`}
              data-question-id={question.id}
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
                  {(() => {
                    const history = questionVersions[question.id];
                    const currentVersion =
                      history?.current_version ?? question.current_version ?? 1;
                    const viewedVersion =
                      selectedVersion[question.id] ?? currentVersion;
                    const viewedQuestion = history?.versions.find(
                      (version) => version.version === viewedVersion,
                    );

                    return (
                      <div className="mt-3">
                        <Select
                          onValueChange={(value) =>
                            setSelectedVersion((current) => ({
                              ...current,
                              [question.id]: Number(value),
                            }))
                          }
                          value={String(viewedVersion)}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue>
                              Version {viewedVersion}
                              {viewedVersion === currentVersion ? " (current)" : ""}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {(history?.versions ?? [
                              {
                                id: question.id,
                                version: currentVersion,
                                question_text: question.question_text,
                                question_type: question.question_type,
                                difficulty: question.difficulty,
                                created_at: "",
                              },
                            ]).map((version) => (
                              <SelectItem key={version.id} value={String(version.version)}>
                                Version {version.version}
                                {version.version === currentVersion ? " (current)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {viewedQuestion && viewedVersion !== currentVersion && (
                          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                            <p className="font-semibold text-slate-800">
                              {viewedQuestion.question_text}
                            </p>
                            <p className="mt-1 text-xs">
                              {viewedQuestion.question_type} · Level {viewedQuestion.difficulty}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
