import { api } from "./client";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
};

export type Subject = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
};

export type Module = {
  id: string;
  subject_id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
};

export async function getWorkspaces() {
  const response = await api.get<{ workspaces: Workspace[] }>(
    "/content/workspaces",
  );
  return response.data.workspaces;
}

export async function createWorkspace(workspace: {
  name: string;
  description?: string;
}) {
  await api.post("/content/create-workspace", workspace);
}

export async function getSubjects(workspaceId: string) {
  const response = await api.get<{ subjects: Subject[] }>(
    `/content/workspaces/${workspaceId}/subjects`,
  );
  return response.data.subjects;
}

export async function createSubject(subject: {
  workspace_id: string;
  name: string;
  description?: string;
}) {
  await api.post("/content/create-subject", subject);
}

export async function getModules(subjectId: string) {
  const response = await api.get<{ modules: Module[] }>(
    `/content/subjects/${subjectId}/modules`,
  );
  return response.data.modules;
}

export async function createModule(module: {
  subject_id: string;
  name: string;
  description?: string;
}) {
  await api.post("/content/create-module", module);
}
