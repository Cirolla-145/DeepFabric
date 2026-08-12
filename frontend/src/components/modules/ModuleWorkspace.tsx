import { useEffect, useState, type CSSProperties } from "react";
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
import { Pie } from "./pie";
import { QuestionsPanel } from "./QuestionsPanel";
import { QuestionPlayer } from "./QuestionPlayer";
import { SourcePanel } from "./SourcePanel";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

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

function MasteryProgress({
  score,
  color = "text-blue-600",
  size = "2.5rem",
}: {
  score: number | null;
  color?: string;
  size?: string;
}) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div
      aria-valuenow={value}
      className={`radial-progress text-xs font-bold ${color}`}
      role="progressbar"
      style={
        {
          "--value": value,
          "--size": size,
          "--thickness": "0.3rem",
        } as CSSProperties
      }
    >
      {value}%
    </div>
  );
}

function masteryLabel(score: number | null) {
  const value = Number(score) || 0;

  if (value < 30) return "Needs practice";
  if (value < 60) return "Learning";
  if (value < 80) return "Proficient";
  return "Mastered";
}

export function ModuleWorkspace({
  module,
  workspaceName,
  subjectName,
}: {
  module: Module | null;
  workspaceName?: string;
  subjectName?: string;
}) {
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
    setSources([]);
    setConcepts([]);
    setQuestions([]);
    setInsights(null);
    setAuditLogs([]);
    setMessage("");
    setStudySession(null);
    setStudyQuestions([]);

    if (!module) return;

    void getModuleSources(module.id)
      .then(setSources)
      .catch(() => setMessage("Unable to load module sources."));
    void getModuleConcepts(module.id).then(setConcepts);
    void getModuleQuestions(module.id).then(setQuestions);
    void getModuleInsights(module.id).then(setInsights);
    void getModuleAuditLogs(module.id).then(setAuditLogs);
  }, [module?.id]);

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
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-7 sm:py-5">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-indigo-600">
            Study session
          </p>
          <h1 className="mt-1 text-2xl font-bold">{module.name}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
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
    } catch (error: any) {
      setMessage(
        error.response?.data?.message ??
          "Accept or edit concepts before generating questions.",
      );
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
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 pt-4 sm:px-7 sm:pt-6">
        <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          <span className="font-semibold text-indigo-600">{workspaceName}</span>
          <span className="text-indigo-200">/</span>
          <span className="text-slate-600">{subjectName}</span>
          <span className="text-indigo-200">/</span>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            {module.name}
          </h1>
        </div>
        {module.description && (
          <p className="mt-2 text-sm text-slate-600">{module.description}</p>
        )}
        <div className="mt-4 overflow-x-auto pb-1 sm:mt-6">
          <Tabs
            className="w-max"
            onValueChange={(value) => selectTab(value as Tab)}
            value={activeTab}
          >
            <TabsList variant="line">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>
      <div
        className={`min-h-0 flex-1 p-4 sm:p-7 ${
          activeTab === "questions"
            ? "overflow-hidden"
            : activeTab === "sources"
              ? "overflow-y-auto xl:overflow-hidden"
              : "overflow-y-auto"
        }`}
      >
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
          <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-indigo-600">
              STUDY SESSION
            </p>
            <h2 className="mt-1 text-2xl font-bold">Practice this module</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Start a ten-question session using approved questions. The backend
              chooses the latest versions and can focus on low-mastery concepts.
            </p>
            <Button
              className="mt-6"
              disabled={isWorking}
              onClick={() => void beginStudySession()}
              type="button"
            >
              {isWorking && <Spinner />}
              Start 10-question session
            </Button>
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
    <div className="max-w-6xl">
      <div>
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            LEARNING INSIGHTS
          </p>
          <h2 className="mt-1 text-2xl font-bold">Mastery and weak areas</h2>
        </div>
      </div>
      <div className="mt-6">
        <Pie concepts={concepts} distribution={insights.mastery_distribution} />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="font-bold">Weak concepts</h3>
        <div className="mt-4 grid auto-rows-[12.5rem] grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
          {insights.weak_concepts.length ? (
            insights.weak_concepts.map((concept) => (
              <div
                className="card h-full border border-rose-100 bg-rose-50 shadow-sm"
                key={concept.id}
              >
                <div className="card-body flex h-full flex-col p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <h4 className="card-title min-w-0 flex-1 line-clamp-3 text-sm leading-5 text-slate-900">
                      {concept.title}
                    </h4>
                    <MasteryProgress
                      color="text-rose-500"
                      score={concept.mastery_score}
                      size="3.5rem"
                    />
                  </div>
                  <p className="mt-auto text-xs font-medium text-rose-700">
                    Needs more practice
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No mastery data yet.</p>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="font-bold">Mastery by concept</h3>
        <div className="mt-4 grid auto-rows-[12.5rem] grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
          {concepts
            .filter((concept) =>
              ["accepted", "edited", "merged"].includes(concept.status),
            )
            .map((concept) => (
              <div
                className="card h-full border border-slate-200 bg-slate-50 shadow-sm"
                key={concept.id}
              >
                <div className="card-body flex h-full flex-col p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <h4 className="card-title min-w-0 flex-1 line-clamp-3 text-sm leading-5 text-slate-900">
                      {concept.title}
                    </h4>
                    <MasteryProgress
                      score={concept.mastery_score}
                      size="3.5rem"
                    />
                  </div>
                  <p className="mt-auto text-xs font-medium text-slate-500">
                    {masteryLabel(concept.mastery_score)}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
