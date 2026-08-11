import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRight, CircleHelp, LogOut, Plus, X } from "lucide-react";
import {
  HiOutlineAcademicCap,
  HiOutlineRectangleStack,
} from "react-icons/hi2";
import { MdOutlineWorkspaces } from "react-icons/md";
import flowImage from "../assets/flow.png";
import { useDispatch, useSelector } from "react-redux";
import {
  createModule,
  createSubject,
  createWorkspace,
  getModules,
  getSubjects,
  getWorkspaces,
  type Module,
  type Subject,
  type Workspace,
} from "../api/contentApi";
import { getHomeInsights, type HomeInsights } from "../api/learningApi";
import { HomeDashboard } from "../components/home/HomeDashboard";
import { ModuleWorkspace } from "../components/modules/ModuleWorkspace";
import { Button } from "../components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar";
import { userLogoutThunk } from "../redux/authSlice";
import {
  clearModules,
  clearSubjects,
  setContentError,
  setModules,
  setSubjects,
  setWorkspaces,
} from "../redux/contentSlice";

type AddTarget =
  | { type: "workspace" }
  | { type: "subject"; workspaceId: string }
  | { type: "module"; subjectId: string };

function CreateItemForm({
  label,
  onSubmit,
  onCancel,
}: {
  label: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    await onSubmit(name.trim(), description.trim());
    setName("");
    setDescription("");
  };

  return (
    <form className="space-y-2 px-2 py-2" onSubmit={(event) => void submit(event)}>
      <SidebarInput
        autoFocus
        onChange={(event) => setName(event.target.value)}
        placeholder={`${label} name`}
        value={name}
      />
      <SidebarInput
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (optional)"
        value={description}
      />
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Create
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DashboardPage() {
  const dispatch = useDispatch<any>();
  const authUser = useSelector((state: any) => state.userLogin.currentUser);
  const workspaces = useSelector((state: any) => state.content.workspaces);
  const subjects = useSelector((state: any) => state.content.subjects);
  const modules = useSelector((state: any) => state.content.modules);

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState("");
  const [expandedSubjectId, setExpandedSubjectId] = useState("");
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [homeInsights, setHomeInsights] = useState<HomeInsights | null>(null);
  const helpDialogRef = useRef<HTMLDialogElement>(null);

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
    void getHomeInsights().then(setHomeInsights);
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

  const toggleWorkspace = (workspaceId: string) => {
    if (workspaceId === selectedWorkspaceId) {
      setExpandedWorkspaceId((current) => (current === workspaceId ? "" : workspaceId));
      setExpandedSubjectId("");
      return;
    }

    selectWorkspace(workspaceId);
    setExpandedWorkspaceId(workspaceId);
    setExpandedSubjectId("");
  };

  const toggleSubject = (subjectId: string) => {
    if (subjectId === selectedSubjectId) {
      setExpandedSubjectId((current) => (current === subjectId ? "" : subjectId));
      return;
    }

    selectSubject(subjectId);
    setExpandedSubjectId(subjectId);
  };

  const goHome = () => {
    setSelectedWorkspaceId("");
    setSelectedSubjectId("");
    setSelectedModuleId("");
    setExpandedWorkspaceId("");
    setExpandedSubjectId("");
    setAddTarget(null);
  };

  const addWorkspace = async (name: string, description: string) => {
    try {
      await createWorkspace({ name, description: description || undefined });
      await loadWorkspaces();
    } catch {
      showError("Unable to create workspace.");
    }
  };

  const addSubject = async (
    workspaceId: string,
    name: string,
    description: string,
  ) => {
    try {
      await createSubject({
        workspace_id: workspaceId,
        name,
        description: description || undefined,
      });
      await loadSubjects(workspaceId);
    } catch {
      showError("Unable to create subject.");
    }
  };

  const addModule = async (
    subjectId: string,
    name: string,
    description: string,
  ) => {
    try {
      await createModule({
        subject_id: subjectId,
        name,
        description: description || undefined,
      });
      await loadModules(subjectId);
    } catch {
      showError("Unable to create module.");
    }
  };

  const selectedModule =
    (modules.find((module: Module) => module.id === selectedModuleId) ?? null) as Module | null;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={goHome} size="lg" tooltip="Go to home">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  D
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">DeepFabric</span>
                  <span className="truncate text-xs">Study workspace</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="group-data-[collapsible=icon]:hidden">
          <SidebarGroup>
            <SidebarGroupLabel className="flex h-9 items-center gap-2 px-2 text-sm font-semibold text-slate-900">
              <MdOutlineWorkspaces className="size-4 text-indigo-500" />
              <span>Workspaces</span>
              <button
                aria-label="Add workspace"
                className="ml-auto rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => setAddTarget({ type: "workspace" })}
                type="button"
              >
                <Plus className="size-4" />
              </button>
            </SidebarGroupLabel>
            <SidebarGroupContent className="pl-2">
              <SidebarMenu>
                {workspaces.map((workspace: Workspace) => (
                    <SidebarMenuItem key={workspace.id}>
                      <div className="flex items-center gap-1">
                        <SidebarMenuButton
                          className="min-w-0 flex-1 rounded-lg text-slate-700 hover:bg-indigo-50 hover:text-slate-950 data-active:bg-indigo-100 data-active:text-indigo-950 data-active:shadow-sm"
                          isActive={workspace.id === selectedWorkspaceId}
                          onClick={() => toggleWorkspace(workspace.id)}
                          tooltip={workspace.name}
                        >
                          <ChevronRight
                            className={`size-4 shrink-0 transition-transform ${expandedWorkspaceId === workspace.id ? "rotate-90" : ""}`}
                          />
                          <MdOutlineWorkspaces className="size-4 text-indigo-500" />
                          <span>{workspace.name}</span>
                        </SidebarMenuButton>
                        {expandedWorkspaceId === workspace.id && (
                          <button
                            aria-label={`Add subject to ${workspace.name}`}
                            className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-indigo-100 hover:text-indigo-700"
                            onClick={() =>
                              setAddTarget({
                                type: "subject",
                                workspaceId: workspace.id,
                              })
                            }
                            type="button"
                          >
                            <Plus className="size-4" />
                          </button>
                        )}
                      </div>

                      {expandedWorkspaceId === workspace.id &&
                        workspace.id === selectedWorkspaceId && (
                          <div className="mt-1 ml-4 border-l border-indigo-100 pl-2">
                            <SidebarMenu>
                              {subjects.map((subject: Subject) => (
                                <SidebarMenuItem key={subject.id}>
                                  <div className="flex items-center gap-1">
                                    <SidebarMenuButton
                                      className="min-w-0 flex-1 rounded-lg text-slate-700 hover:bg-indigo-50 hover:text-slate-950 data-active:bg-indigo-100 data-active:text-indigo-950 data-active:shadow-sm"
                                      isActive={subject.id === selectedSubjectId}
                                      onClick={() => toggleSubject(subject.id)}
                                      tooltip={subject.name}
                                    >
                                      <ChevronRight
                                        className={`size-4 shrink-0 transition-transform ${expandedSubjectId === subject.id ? "rotate-90" : ""}`}
                                      />
                                      <HiOutlineAcademicCap className="size-4 text-indigo-500" />
                                      <span>{subject.name}</span>
                                    </SidebarMenuButton>
                                    {expandedSubjectId === subject.id && (
                                      <button
                                        aria-label={`Add module to ${subject.name}`}
                                        className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-indigo-100 hover:text-indigo-700"
                                        onClick={() =>
                                          setAddTarget({
                                            type: "module",
                                            subjectId: subject.id,
                                          })
                                        }
                                        type="button"
                                      >
                                        <Plus className="size-4" />
                                      </button>
                                    )}
                                  </div>

                                  {expandedSubjectId === subject.id &&
                                    subject.id === selectedSubjectId && (
                                      <div className="mt-1 ml-4 border-l border-indigo-100 pl-2">
                                        <SidebarMenu>
                                          {modules.map((module: Module) => (
                                            <SidebarMenuItem key={module.id}>
                                              <SidebarMenuButton
                                                className="rounded-lg text-slate-700 hover:bg-indigo-50 hover:text-slate-950 data-active:bg-indigo-100 data-active:text-indigo-950 data-active:shadow-sm"
                                                isActive={module.id === selectedModuleId}
                                                onClick={() =>
                                                  setSelectedModuleId(module.id)
                                                }
                                                tooltip={module.name}
                                              >
                                                <HiOutlineRectangleStack className="size-4 text-indigo-500" />
                                                <span>{module.name}</span>
                                              </SidebarMenuButton>
                                            </SidebarMenuItem>
                                          ))}
                                        </SidebarMenu>
                                        {addTarget?.type === "module" &&
                                          addTarget.subjectId === subject.id && (
                                            <CreateItemForm
                                              label="module"
                                              onCancel={() => setAddTarget(null)}
                                              onSubmit={async (name, description) => {
                                                await addModule(
                                                  subject.id,
                                                  name,
                                                  description,
                                                );
                                                setAddTarget(null);
                                              }}
                                            />
                                          )}
                                      </div>
                                    )}
                                </SidebarMenuItem>
                              ))}
                            </SidebarMenu>
                            {addTarget?.type === "subject" &&
                              addTarget.workspaceId === workspace.id && (
                                <CreateItemForm
                                  label="subject"
                                  onCancel={() => setAddTarget(null)}
                                  onSubmit={async (name, description) => {
                                    await addSubject(
                                      workspace.id,
                                      name,
                                      description,
                                    );
                                    setAddTarget(null);
                                  }}
                                />
                              )}
                          </div>
                        )}
                    </SidebarMenuItem>
                ))}

                {addTarget?.type === "workspace" && (
                  <CreateItemForm
                    label="workspace"
                    onCancel={() => setAddTarget(null)}
                    onSubmit={async (name, description) => {
                      await addWorkspace(name, description);
                      setAddTarget(null);
                    }}
                  />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => helpDialogRef.current?.showModal()}
                tooltip="Open help"
              >
                <CircleHelp className="text-indigo-500" />
                <span>Help</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:h-16 sm:px-4">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {authUser?.name}
            </span>
            <Button onClick={() => void dispatch(userLogoutThunk())} type="button" variant="ghost">
              <LogOut />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>
        {selectedModule ? (
          <ModuleWorkspace module={selectedModule} />
        ) : (
          <HomeDashboard insights={homeInsights} />
        )}
      </SidebarInset>

      <dialog className="modal" ref={helpDialogRef}>
        <div className="modal-box h-[85vh] max-w-6xl bg-slate-50 p-4 text-slate-900 sm:p-6">
          <form method="dialog">
            <button
              aria-label="Close help"
              className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
            >
              <X className="size-4" />
            </button>
          </form>
          <h2 className="text-xl font-bold text-slate-900">How DeepFabric works</h2>
          <p className="mt-1 text-sm text-slate-500">Follow this study flow as you use the workspace.</p>
          <div className="mt-4 h-[calc(100%-4.5rem)] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
            <img alt="DeepFabric study flow" className="mx-auto h-auto max-w-full" src={flowImage} />
          </div>
        </div>
        <form className="modal-backdrop" method="dialog">
          <button>Close</button>
        </form>
      </dialog>
    </SidebarProvider>
  );
}
