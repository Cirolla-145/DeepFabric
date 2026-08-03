import { useEffect, useState } from "react";
import type { Module } from "../../api/contentApi";
import {
  generateQuestions,
  getModuleAuditLogs,
  getModuleConcepts,
  getModuleInsights,
  getModuleQuestions,
  getModuleSources,
  startStudySession,
  type AuditLog,
  type Concept,
  type Insights,
  type Question,
  type Source,
  type StudyQuestion,
  type StudySession,
} from "../../api/learningApi";
import { AuditPanel } from "./AuditPanel";
import { ConceptsPanel } from "./ConceptsPanel";
import { QuestionsPanel } from "./QuestionsPanel";
import { QuestionPlayer } from "./QuestionPlayer";
import { SourcePanel } from "./SourcePanel";

type Tab =
  | "sources"
  | "concepts"
  | "questions"
  | "study"
  | "insights"
  | "audit";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "sources", label: "Sources" },
  { id: "concepts", label: "Concepts" },
  { id: "questions", label: "Questions" },
  { id: "study", label: "Study" },
  { id: "insights", label: "Insights" },
  { id: "audit", label: "Audit" },
];

export function ModuleWorkspace({ module }: { module: Module | null }) {
  const [activeTab, setActiveTab] = useState<Tab>("sources");
  const [sources, setSources] = useState<Source[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [studySession, setStudySession] = useState<StudySession | null>(null);
  const [studyQuestions, setStudyQuestions] = useState<StudyQuestion[]>([]);

  const loadSources = async () => {
    if (module) setSources(await getModuleSources(module.id));
  };

  const loadConcepts = async () => {
    if (module) setConcepts(await getModuleConcepts(module.id));
  };

  const loadQuestions = async () => {
    if (module) setQuestions(await getModuleQuestions(module.id));
  };

  const loadInsights = async () => {
    if (module) setInsights(await getModuleInsights(module.id));
  };

  const loadAuditLogs = async () => {
    if (module) setAuditLogs(await getModuleAuditLogs(module.id));
  };

  const updateConcept = (conceptId: string, changes: Partial<Concept>) => {
    setConcepts((current) =>
      current.map((concept) =>
        concept.id === conceptId ? { ...concept, ...changes } : concept,
      ),
    );
  };

  const updateQuestion = (questionId: string, changes: Partial<Question>) => {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId ? { ...question, ...changes } : question,
      ),
    );
  };

  const mergeConceptsInView = (
    sourceConceptId: string,
    targetConceptId: string,
    mergedConcept: Concept,
  ) => {
    setConcepts((current) => [
      mergedConcept,
      ...current.map((concept) =>
        [sourceConceptId, targetConceptId].includes(concept.id)
          ? { ...concept, status: "rejected" }
          : concept,
      ),
    ]);
  };

  useEffect(() => {
    if (!module) return;
    getModuleSources(module.id)
      .then(setSources)
      .catch(() => setMessage("Unable to load module sources."));
  }, [module]);

  if (!module) {
    return (
      <section className="grid h-full place-items-center bg-slate-50 p-8 text-center">
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            SELECT A MODULE
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Your study workspace will appear here.
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-slate-600">
            Choose a module from the sidebar, or create one inside a subject to
            start adding study material.
          </p>
        </div>
      </section>
    );
  }

  if (studySession) {
    return (
      <section className="flex h-full min-w-0 flex-1 flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-7 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-indigo-600">
            Study session
          </p>
          <h1 className="mt-1 text-2xl font-bold">{module.name}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-7">
          <QuestionPlayer
            onClose={() => {
              setStudySession(null);
              setStudyQuestions([]);
              void loadInsights();
            }}
            questions={studyQuestions}
            session={studySession}
          />
        </div>
      </section>
    );
  }

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "concepts") void loadConcepts();
    if (tab === "questions") void loadQuestions();
    if (tab === "insights") {
      void loadInsights();
      void loadConcepts();
    }
    if (tab === "audit") void loadAuditLogs();
  };

  const generateQuestionsForModule = async () => {
    setIsWorking(true);
    try {
      await generateQuestions(module.id);
      await loadQuestions();
      setMessage("Question suggestions are ready for review.");
    } catch {
      setMessage("Accept or edit concepts before generating questions.");
    } finally {
      setIsWorking(false);
    }
  };

  const beginStudySession = async () => {
    setIsWorking(true);
    try {
      const sessionData = await startStudySession(module.id);
      setStudySession(sessionData.study_session);
      setStudyQuestions(sessionData.questions);
    } catch {
      setMessage(
        "You need at least 10 approved or edited questions to start this session.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-7 pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-indigo-600">
          Module
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {module.name}
        </h1>
        {module.description && (
          <p className="mt-2 text-sm text-slate-600">{module.description}</p>
        )}
        <div className="mt-6 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              className={`border-b-2 px-3 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-950"}`}
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-7">
        {message && (
          <p className="mb-5 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            {message}
          </p>
        )}
        {activeTab === "sources" && (
          <SourcePanel
            module={module}
            onMessage={setMessage}
            onProcessed={loadConcepts}
            onSourcesChanged={loadSources}
            sources={sources}
          />
        )}
        {activeTab === "concepts" && (
          <ConceptsPanel
            concepts={concepts}
            onConceptMerged={mergeConceptsInView}
            onConceptUpdated={updateConcept}
            onMessage={setMessage}
          />
        )}
        {activeTab === "questions" && (
          <QuestionsPanel
            isGenerating={isWorking}
            onGenerate={generateQuestionsForModule}
            onMessage={setMessage}
            onQuestionUpdated={updateQuestion}
            questions={questions}
          />
        )}
        {activeTab === "study" && (
          <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-indigo-600">
              STUDY SESSION
            </p>
            <h2 className="mt-1 text-2xl font-bold">Practice this module</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Start a ten-question session using approved questions. The backend
              chooses the latest versions and can focus on low-mastery concepts.
            </p>
            <button
              className="mt-6 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isWorking}
              onClick={() => void beginStudySession()}
              type="button"
            >
              Start 10-question session
            </button>
          </div>
        )}
        {activeTab === "insights" && (
          <InsightsView concepts={concepts} insights={insights} />
        )}
        {activeTab === "audit" && <AuditPanel auditLogs={auditLogs} />}
      </div>
    </section>
  );
}

function InsightsView({
  concepts,
  insights,
}: {
  concepts: Concept[];
  insights: Insights | null;
}) {
  if (!insights)
    return (
      <div className="max-w-4xl">
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">
          Loading learning insights…
        </p>
      </div>
    );
  return (
    <div className="max-w-4xl">
      <div>
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            LEARNING INSIGHTS
          </p>
          <h2 className="mt-1 text-2xl font-bold">Mastery and weak areas</h2>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {Object.entries(insights.mastery_distribution).map(
          ([bucket, count]) => (
            <div
              className="rounded-2xl border border-slate-200 bg-white p-4"
              key={bucket}
            >
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
                {bucket.replace("_count", "")}
              </p>
              <p className="mt-2 text-2xl font-bold">{count}</p>
            </div>
          ),
        )}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold">Weak concepts</h3>
        <div className="mt-3 space-y-2">
          {insights.weak_concepts.length ? (
            insights.weak_concepts.map((concept) => (
              <div
                className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                key={concept.id}
              >
                <span>{concept.title}</span>
                <span className="font-semibold text-rose-600">
                  {concept.mastery_score}%
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No mastery data yet.</p>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold">Mastery by concept</h3>
        <div className="mt-3 space-y-2">
          {concepts
            .filter((concept) =>
              ["accepted", "edited"].includes(concept.status),
            )
            .map((concept) => (
              <div
                className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                key={concept.id}
              >
                <span>{concept.title}</span>
                <span className="font-semibold text-indigo-700">
                  {concept.mastery_score ?? 0}%
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
