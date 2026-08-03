import { api } from "./client";

export type Source = {
  id: string;
  title: string;
  source_type: "paste" | "pdf" | "image";
  status: "draft" | "processed" | "needs_review";
  current_version: number;
  raw_text: string;
};

export type Concept = {
  id: string;
  title: string;
  definition: string | null;
  status: string;
  mastery_score: number | null;
};

export type Question = {
  id: string;
  question_text: string;
  question_type: string;
  difficulty: number;
  status: string;
  concept_title: string;
};

export type AuditLog = {
  id: string;
  entity_type: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
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

export async function getModuleConcepts(moduleId: string) {
  const response = await api.get<{ concepts: Concept[] }>(
    `/learning/modules/${moduleId}/concepts`,
  );
  return response.data.concepts;
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

export async function endStudySession(sessionId: string) {
  await api.patch(`/learning/study-sessions/${sessionId}/end`);
}

export async function getModuleAuditLogs(moduleId: string) {
  const response = await api.get<{ audit_logs: AuditLog[] }>(
    `/learning/modules/${moduleId}/audit-logs`,
  );
  return response.data.audit_logs;
}
