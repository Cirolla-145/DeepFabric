import { api } from "./client";

export type Source = {
  id: string;
  title: string;
  source_type: "paste" | "pdf" | "image";
  status: "draft" | "processed" | "needs_review";
  current_version: number;
  raw_text: string | null;
};

export type SourceVersion = {
  id: string;
  version: number;
  raw_text: string | null;
  created_at: string;
};

export type Concept = {
  id: string;
  title: string;
  definition: string | null;
  status: string;
  is_outdated: boolean;
  merged_into_concept_id: string | null;
  mastery_score: number | null;
};

export type ConceptVersion = {
  version: number;
  title: string;
  definition: string | null;
  created_at: string;
};

export type Question = {
  id: string;
  question_text: string;
  question_type: string;
  difficulty: number;
  status: string;
  concept_title: string;
  current_version: number;
};

export type QuestionVersion = {
  id: string;
  version: number;
  question_text: string;
  question_type: string;
  difficulty: number;
  created_at: string;
};

export type AuditLog = {
  id: string;
  entity_type: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export type HomeInsights = {
  has_activity: boolean;
  total_sessions: number;
  total_correct: number;
  attempt_counts: { correct: number; incorrect: number; partial: number };
  difficulty_counts: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
    level_5: number;
  };
  activity: Array<{
    date: string;
    sessions: number;
    correct_answers: number;
  }>;
};

export type StudyQuestion = {
  id: string;
  question_version_id: string;
  question_type: "mcq" | "true_false" | "short_answer";
  question_text: string;
  options: string[] | string | null;
  difficulty: number;
  concept_title: string;
};

export type StudySession = {
  id: string;
  module_id: string;
  question_count: number;
};

export type GradeResult = {
  attempt: {
    id: string;
    result: "correct" | "partial" | "incorrect";
    confidence: number;
    grading_reason: string;
  };
  mastery: { score: number; bucket: string; next_review_at: string };
};

export type Insights = {
  mastery_distribution: {
    new_count: number;
    learning_count: number;
    proficient_count: number;
    mastered_count: number;
  };
  weak_concepts: Array<{ id: string; title: string; mastery_score: number }>;
};

export async function getModuleSources(moduleId: string) {
  const response = await api.get<{ sources: Source[] }>(
    `/learning/modules/${moduleId}/sources`,
  );
  return response.data.sources;
}

export async function createSource(source: {
  module_id: string;
  title: string;
  raw_text: string;
}) {
  const response = await api.post<{ source: { id: string } }>(
    "/learning/sources",
    source,
  );
  return response.data;
}

export async function createPdfSource(source: {
  module_id: string;
  title: string;
  file_data: string;
}) {
  await api.post("/learning/sources", { ...source, source_type: "pdf" });
}

export async function importSourceUrl(source: {
  module_id: string;
  title: string;
  source_url: string;
}) {
  await api.post("/learning/sources", source);
}

export async function processSource(sourceId: string) {
  const response = await api.post(`/learning/sources/${sourceId}/process`);
  return response.data;
}

export async function createSourceVersion(sourceId: string, rawText: string) {
  await api.post("/learning/source-versions", {
    source_id: sourceId,
    raw_text: rawText,
  });
}

export async function getSourceVersions(sourceId: string) {
  const response = await api.get<{ versions: SourceVersion[] }>(
    `/learning/sources/${sourceId}/versions`,
  );
  return response.data.versions;
}

export async function getModuleConcepts(moduleId: string) {
  const response = await api.get<{ concepts: Concept[] }>(
    `/learning/modules/${moduleId}/concepts`,
  );
  return response.data.concepts;
}

export async function getConceptVersions(conceptId: string) {
  const response = await api.get<{
    current_version: number;
    versions: ConceptVersion[];
  }>(`/learning/concepts/${conceptId}/versions`);
  return response.data;
}

export async function reviewConcept(
  conceptId: string,
  concept: {
    action: "accept" | "edit" | "reject";
    title?: string;
    definition?: string;
  },
) {
  await api.patch(`/learning/concepts/${conceptId}`, concept);
}

export async function mergeConcepts(
  sourceConceptId: string,
  targetConceptId: string,
) {
  const response = await api.patch<{
    merged_concept: Concept;
  }>(`/learning/concepts/${sourceConceptId}/merge`, {
    target_concept_id: targetConceptId,
  });
  return response.data;
}

export async function generateQuestions(moduleId: string) {
  const response = await api.post(
    `/learning/modules/${moduleId}/questions/regenerate`,
    {},
  );
  return response.data;
}

export async function getModuleQuestions(moduleId: string) {
  const response = await api.get<{ questions: Question[] }>(
    `/learning/modules/${moduleId}/questions`,
  );
  return response.data.questions;
}

export async function getQuestionVersions(questionId: string) {
  const response = await api.get<{
    current_version: number;
    versions: QuestionVersion[];
  }>(`/learning/questions/${questionId}/versions`);
  return response.data;
}

export async function reviewQuestion(
  questionId: string,
  question: {
    action: "approve" | "edit" | "retire";
    question_text?: string;
    difficulty?: number;
  },
) {
  await api.patch(`/learning/questions/${questionId}`, question);
}

export async function getModuleInsights(moduleId: string) {
  const response = await api.get<{
    mastery_distribution: Insights["mastery_distribution"];
    weak_concepts: Insights["weak_concepts"];
  }>(`/learning/modules/${moduleId}/insights`);
  return response.data;
}

export async function startStudySession(moduleId: string) {
  const response = await api.post("/learning/study-sessions", {
    module_id: moduleId,
    question_count: 10,
  });
  return response.data;
}

export async function createAttempt(attempt: {
  study_session_id: string;
  question_id: string;
  question_version_id: string;
  user_answer: string;
}) {
  const response = await api.post<{ attempt: { id: string } }>(
    "/learning/attempts",
    attempt,
  );
  return response.data.attempt;
}

export async function gradeAttempt(attemptId: string) {
  const response = await api.patch<GradeResult>(
    `/learning/attempts/${attemptId}/grade`,
    {},
  );
  return response.data;
}

export async function overrideAttemptGrade(
  attemptId: string,
  result: "correct" | "partial" | "incorrect",
  overrideReason: string,
) {
  const response = await api.patch<{
    attempt: { id: string; result: "correct" | "partial" | "incorrect" };
    mastery: GradeResult["mastery"];
  }>(`/learning/attempts/${attemptId}/override`, {
    result,
    override_reason: overrideReason || null,
  });
  return response.data;
}

export async function endStudySession(sessionId: string) {
  await api.patch(`/learning/study-sessions/${sessionId}/end`);
}

export async function getModuleAuditLogs(moduleId: string) {
  const response = await api.get<{ audit_logs: AuditLog[] }>(
    `/learning/modules/${moduleId}/audit-logs`,
  );
  return response.data.audit_logs;
}

export async function getHomeInsights() {
  const response = await api.get<HomeInsights>("/learning/home-insights");
  return response.data;
}
