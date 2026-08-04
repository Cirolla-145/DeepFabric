import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  createModule,
  createSubject,
  createWorkspace,
  getModules,
  getSubjects,
  getWorkspaces,
  type Module,
} from "../api/contentApi";
import { ModuleWorkspace } from "../components/modules/ModuleWorkspace";
import { StudySidebar } from "../components/navigation/StudySidebar";
import { userLogoutThunk } from "../redux/authSlice";
import {
  clearModules,
  clearSubjects,
  setContentError,
  setModules,
  setSubjects,
  setWorkspaces,
} from "../redux/contentSlice";

export function DashboardPage() {
  
  const dispatch = useDispatch<any>();
  
  const authUser = useSelector((state: any) => state.userLogin.currentUser);
  
  const workspaces = useSelector((state: any) => state.content.workspaces);
  
  const subjects = useSelector((state: any) => state.content.subjects);
  
  const modules = useSelector((state: any) => state.content.modules);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");

  const showError = (message: string) => dispatch(setContentError(message));
  const loadWorkspaces = async () => {
    try {
      dispatch(setWorkspaces(await getWorkspaces()));
    } catch {
      showError("Unable to load workspaces.");
    }
  };
  const loadSubjects = async (workspaceId: string) => {
    try {
      dispatch(setSubjects(await getSubjects(workspaceId)));
    } catch {
      showError("Unable to load subjects.");
    }
  };
  const loadModules = async (subjectId: string) => {
    try {
      dispatch(setModules(await getModules(subjectId)));
    } catch {
      showError("Unable to load modules.");
    }
  };

  useEffect(() => {
    void loadWorkspaces(); 
  }, []);

  const selectWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setSelectedSubjectId("");
    setSelectedModuleId("");
    dispatch(clearSubjects());
    void loadSubjects(workspaceId);
  };
  const selectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedModuleId("");
    dispatch(clearModules());
    void loadModules(subjectId);
  };
  const selectedModule = (modules.find(
    (item: Module) => item.id === selectedModuleId,
  ) ?? null) as Module | null;

  const addWorkspace = async (name: string, description: string) => {
    try {
      await createWorkspace({ name, description: description || undefined });
      await loadWorkspaces();
    } catch {
      showError("Unable to create workspace.");
    }
  };
  const addSubject = async (name: string, description: string) => {
    if (!selectedWorkspaceId) return;
    try {
      await createSubject({
        workspace_id: selectedWorkspaceId,
        name,
        description: description || undefined,
      });
      await loadSubjects(selectedWorkspaceId);
    } catch {
      showError("Unable to create subject.");
    }
  };
  const addModule = async (name: string, description: string) => {
    if (!selectedSubjectId) return;
    try {
      await createModule({
        subject_id: selectedSubjectId,
        name,
        description: description || undefined,
      });
      await loadModules(selectedSubjectId);
    } catch {
      showError("Unable to create module.");
    }
  };

  return (
    <main className="flex h-screen overflow-hidden bg-slate-50">
      <StudySidebar
        modules={modules}
        onModuleCreate={addModule}
        onModuleSelect={setSelectedModuleId}
        onSubjectCreate={addSubject}
        onSubjectSelect={selectSubject}
        onWorkspaceCreate={addWorkspace}
        onWorkspaceSelect={selectWorkspace}
        selectedModuleId={selectedModuleId}
        selectedSubjectId={selectedSubjectId}
        selectedWorkspaceId={selectedWorkspaceId}
        subjects={subjects}
        workspaces={workspaces}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-6">
          <span className="mr-4 text-sm text-slate-500">{authUser?.name}</span>
          <button
            className="text-sm font-semibold text-slate-600 hover:text-slate-950"
            onClick={() => void dispatch(userLogoutThunk())}
            type="button"
          >
            Log out
          </button>
        </div>
        <ModuleWorkspace module={selectedModule} />
      </div>
    </main>
  );
}
