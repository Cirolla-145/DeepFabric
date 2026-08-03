import { useState, type FormEvent } from "react";
import type { Module, Subject, Workspace } from "../../api/contentApi";

type SidebarProps = {
  workspaces: Workspace[];
  subjects: Subject[];
  modules: Module[];
  selectedWorkspaceId: string;
  selectedSubjectId: string;
  selectedModuleId: string;
  onWorkspaceSelect: (workspaceId: string) => void;
  onSubjectSelect: (subjectId: string) => void;
  onModuleSelect: (moduleId: string) => void;
  onWorkspaceCreate: (name: string, description: string) => Promise<void>;
  onSubjectCreate: (name: string, description: string) => Promise<void>;
  onModuleCreate: (name: string, description: string) => Promise<void>;
};

function AddItemForm({
  label,
  onSubmit,
}: {
  label: string;
  onSubmit: (name: string, description: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onSubmit(name.trim(), description.trim());
    setName("");
    setDescription("");
    setIsOpen(false);
  };

  if (!isOpen)
    return (
      <button
        className="mt-2 w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        + Add {label}
      </button>
    );

  return (
    <form
      className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(event) => void submit(event)}
    >
      <input
        autoFocus
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-indigo-500"
        onChange={(event) => setName(event.target.value)}
        placeholder={`${label} name`}
        value={name}
      />
      <input
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-indigo-500"
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (optional)"
        value={description}
      />
      <div className="mt-2 flex gap-2">
        <button
          className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white"
          type="submit"
        >
          Create
        </button>
        <button
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function StudySidebar(props: SidebarProps) {
  const selectedWorkspace = props.workspaces.find(
    (workspace) => workspace.id === props.selectedWorkspaceId,
  );
  const selectedSubject = props.subjects.find(
    (subject) => subject.id === props.selectedSubjectId,
  );

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center gap-3 font-bold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-base text-white">
            D
          </span>
          DeepFabric
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Study hierarchy
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <section>
          <p className="px-2 text-xs font-bold uppercase tracking-[0.13em] text-slate-400">
            Workspaces
          </p>
          <div className="mt-2 space-y-1">
            {props.workspaces.map((workspace) => (
              <button
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition ${workspace.id === props.selectedWorkspaceId ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`}
                key={workspace.id}
                onClick={() => props.onWorkspaceSelect(workspace.id)}
                type="button"
              >
                <span className="text-slate-400">
                  {workspace.id === props.selectedWorkspaceId ? "⌄" : "›"}
                </span>
                {workspace.name}
              </button>
            ))}
          </div>
          <AddItemForm label="workspace" onSubmit={props.onWorkspaceCreate} />
        </section>
        {selectedWorkspace && (
          <section className="mt-5 border-l border-slate-200 pl-3">
            <p className="px-2 text-xs font-bold uppercase tracking-[0.13em] text-slate-400">
              {selectedWorkspace.name}
            </p>
            <div className="mt-2 space-y-1">
              {props.subjects.map((subject) => (
                <button
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition ${subject.id === props.selectedSubjectId ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`}
                  key={subject.id}
                  onClick={() => props.onSubjectSelect(subject.id)}
                  type="button"
                >
                  <span className="text-slate-400">
                    {subject.id === props.selectedSubjectId ? "⌄" : "›"}
                  </span>
                  {subject.name}
                </button>
              ))}
            </div>
            <AddItemForm label="subject" onSubmit={props.onSubjectCreate} />
          </section>
        )}
        {selectedSubject && (
          <section className="mt-5 border-l border-slate-200 pl-3">
            <p className="px-2 text-xs font-bold uppercase tracking-[0.13em] text-slate-400">
              {selectedSubject.name}
            </p>
            <div className="mt-2 space-y-1">
              {props.modules.map((module) => (
                <button
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${module.id === props.selectedModuleId ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                  key={module.id}
                  onClick={() => props.onModuleSelect(module.id)}
                  type="button"
                >
                  <span
                    className={
                      module.id === props.selectedModuleId
                        ? "text-slate-400"
                        : "text-slate-400"
                    }
                  >
                    □
                  </span>
                  {module.name}
                </button>
              ))}
            </div>
            <AddItemForm label="module" onSubmit={props.onModuleCreate} />
          </section>
        )}
      </nav>
    </aside>
  );
}
