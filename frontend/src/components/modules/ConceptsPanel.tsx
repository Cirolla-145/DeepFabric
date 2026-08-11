import { useEffect, useState } from "react";
import {
  getConceptVersions,
  mergeConcepts,
  reviewConcept,
  type Concept,
  type ConceptVersion,
} from "../../api/learningApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type ConceptsPanelProps = {
  concepts: Concept[];
  onConceptUpdated: (conceptId: string, changes: Partial<Concept>) => void;
  onConceptMerged: (
    sourceConceptId: string,
    targetConceptId: string,
    mergedConcept: Concept,
  ) => void;
  onMessage: (message: string) => void;
};

function conceptStatusStyle(concept: Concept) {
  if (concept.is_outdated) return "bg-amber-50 text-amber-700";
  if (concept.status === "suggested") return "bg-indigo-50 text-indigo-700";
  if (concept.status === "merged") return "bg-violet-50 text-violet-700";
  if (concept.status === "accepted") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function conceptModalElement(conceptId: string) {
  return document.getElementById(
    `concept-modal-${conceptId}`,
  ) as HTMLDialogElement | null;
}

export function ConceptsPanel({
  concepts,
  onConceptUpdated,
  onConceptMerged,
  onMessage,
}: ConceptsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [definition, setDefinition] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<Record<string, string>>(
    {},
  );
  const [conceptVersions, setConceptVersions] = useState<
    Record<string, { current_version: number; versions: ConceptVersion[] }>
  >({});
  const [selectedVersion, setSelectedVersion] = useState<
    Record<string, number>
  >({});
  const visibleConcepts = concepts.filter(
    (concept) => concept.status !== "rejected",
  );
  const activeConcepts = visibleConcepts;

  const loadConceptVersions = async (conceptId: string) => {
    if (conceptVersions[conceptId]) return;
    try {
      const history = await getConceptVersions(conceptId);
      setConceptVersions((current) => ({ ...current, [conceptId]: history }));
    } catch {
      onMessage("Unable to load concept version history.");
    }
  };

  useEffect(() => {
    concepts.forEach((concept) => void loadConceptVersions(concept.id));
  }, [concepts]);

  const applyReview = async (
    conceptId: string,
    action: "accept" | "edit" | "reject",
  ) => {
    setIsWorking(true);
    try {
      await reviewConcept(
        conceptId,
        action === "edit" ? { action, title, definition } : { action },
      );
      if (action === "edit") {
        const history = await getConceptVersions(conceptId);
        setConceptVersions((current) => ({ ...current, [conceptId]: history }));
        setSelectedVersion((current) => ({
          ...current,
          [conceptId]: history.current_version,
        }));
      }
      setEditingId(null);
      onConceptUpdated(conceptId, {
        ...(action === "edit" ? { title, definition } : {}),
        status:
          action === "accept"
            ? "accepted"
            : action === "reject"
              ? "rejected"
              : "edited",
        is_outdated: false,
      });
      onMessage(
        `Concept ${action === "accept" ? "accepted" : action === "reject" ? "rejected" : "updated"}.`,
      );
    } catch {
      onMessage("Unable to update this concept.");
    } finally {
      setIsWorking(false);
    }
  };

  const mergeInto = async (sourceConceptId: string) => {
    const targetConceptId = mergeTargetId[sourceConceptId];
    if (!targetConceptId) {
      onMessage("Choose the concept that should keep the merged content.");
      return;
    }

    setIsWorking(true);
    try {
      const result = await mergeConcepts(sourceConceptId, targetConceptId);
      onConceptMerged(
        sourceConceptId,
        targetConceptId,
        result.merged_concept,
      );
      setMergeTargetId((current) => ({ ...current, [sourceConceptId]: "" }));
      onMessage(
        "A new AI-merged concept was created. The two original concepts are now rejected.",
      );
    } catch {
      onMessage("Unable to merge these concepts.");
    } finally {
      setIsWorking(false);
    }
  };

  const beginEdit = (concept: Concept) => {
    setEditingId(concept.id);
    setTitle(concept.title);
    setDefinition(concept.definition ?? "");
  };

  return (
    <div className="w-full max-w-none">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            CONCEPT REVIEW
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Generated concept suggestions
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Accept good concepts, edit unclear ones, or reject anything
            irrelevant.
          </p>
        </div>
      </div>
      <div className="mt-6 grid auto-rows-[14rem] grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4 sm:auto-rows-[15rem] sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] sm:gap-5">
        {visibleConcepts.length ? (
          visibleConcepts.map((concept) => (
            <div key={concept.id}>
              <article className="card h-full border border-slate-200 bg-linear-to-br from-white to-slate-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="card-body justify-between p-5">
                  <div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${conceptStatusStyle(concept)}`}
                    >
                      {concept.is_outdated ? "outdated" : concept.status}
                    </span>
                    <h3 className="card-title mt-4 line-clamp-3 text-base leading-6 text-slate-900">
                      {concept.title}
                    </h3>
                  </div>
                  <div className="card-actions justify-end">
                    <button
                      className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                      onClick={() => {
                        setEditingId(null);
                        void loadConceptVersions(concept.id);
                        const dialog = document.getElementById(
                          `concept-modal-${concept.id}`,
                        ) as HTMLDialogElement | null;
                        dialog?.showModal();
                      }}
                      type="button"
                    >
                      Explain
                    </button>
                  </div>
                </div>
              </article>
              <dialog className="modal" id={`concept-modal-${concept.id}`}>
                <div className="modal-box max-h-[85vh] w-[calc(100%-1rem)] max-w-3xl overflow-x-hidden overflow-y-auto border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl sm:w-11/12">
                  <form method="dialog">
                    <button
                      aria-label="Close concept details"
                      className="absolute right-4 top-4 rounded-full p-2 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      type="submit"
                    >
                      ✕
                    </button>
                  </form>
                  <article className="p-5 sm:p-7">
              {editingId === concept.id ? (
                <>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base font-semibold outline-none focus:border-indigo-500"
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                  <textarea
                    className="mt-3 min-h-64 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-500"
                    onChange={(event) => setDefinition(event.target.value)}
                    value={definition}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
                      disabled={isWorking}
                      onClick={() => void applyReview(concept.id, "edit")}
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
                  <div className="flex items-start justify-between gap-4 pr-12">
                    <div>
                      <h3 className="font-bold">{concept.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {concept.definition || "No definition was generated."}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {concept.is_outdated ? "outdated" : concept.status}
                    </span>
                  </div>
                  {(() => {
                    const history = conceptVersions[concept.id];
                    const currentVersion = history?.current_version ?? 1;
                    const viewedVersion =
                      selectedVersion[concept.id] ?? currentVersion;
                    const viewedConcept = history?.versions.find(
                      (version) => version.version === viewedVersion,
                    );
                    
                    return (
                      <div className="mt-3">
                        <Select
                          onValueChange={(value) =>
                            setSelectedVersion((current) => ({
                              ...current,
                              [concept.id]: Number(value),
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
                          <SelectContent
                            className="max-h-64"
                            portalContainer={conceptModalElement(concept.id)}
                          >
                            {(history?.versions ?? [
                              {
                                version: 1,
                                title: concept.title,
                                definition: concept.definition,
                                created_at: "",
                              },
                            ]).map((version) => (
                              <SelectItem key={version.version} value={String(version.version)}>
                                Version {version.version}
                                {version.version === currentVersion ? " (current)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {viewedConcept && viewedVersion !== currentVersion && (
                          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                            <p className="font-semibold text-slate-800">
                              {viewedConcept.title}
                            </p>
                            <p className="mt-1 leading-6">
                              {viewedConcept.definition ||
                                "No definition was saved."}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {concept.status === "merged" && (
                    <p className="mt-4 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                      AI-created merged concept. You can still edit or reject it.
                    </p>
                  )}
                  <>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {concept.status === "suggested" && (
                          <button
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={isWorking}
                            onClick={() =>
                              void applyReview(concept.id, "accept")
                            }
                            type="button"
                          >
                            Accept
                          </button>
                        )}
                        <button
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                          onClick={() => beginEdit(concept)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600"
                          disabled={isWorking}
                          onClick={() => void applyReview(concept.id, "reject")}
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                      <div className="mt-5 border-t border-slate-100 pt-5">
                        <label className="text-xs font-semibold text-slate-500">
                          Merge into
                        </label>
                        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                          <Select
                            onValueChange={(value) =>
                              setMergeTargetId((current) => ({
                                ...current,
                                [concept.id]: value ?? "",
                              }))
                            }
                            value={mergeTargetId[concept.id] || undefined}
                          >
                            <SelectTrigger className="min-w-0 flex-1">
                              <SelectValue placeholder="Choose a concept">
                                {
                                  activeConcepts.find(
                                    (target) =>
                                      target.id === mergeTargetId[concept.id],
                                  )?.title
                                }
                              </SelectValue>
                            </SelectTrigger>
                          <SelectContent
                            className="max-h-64"
                            portalContainer={conceptModalElement(concept.id)}
                            side="top"
                            >
                              {activeConcepts
                                .filter((target) => target.id !== concept.id)
                                .map((target) => (
                                  <SelectItem key={target.id} value={target.id}>
                                    {target.title}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <button
                            className="shrink-0 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
                            disabled={isWorking}
                            onClick={() => void mergeInto(concept.id)}
                            type="button"
                          >
                            Merge
                          </button>
                        </div>
                      </div>
                  </>
                </>
              )}
                  </article>
                </div>
              </dialog>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">
            Process a source to see concept suggestions here.
          </p>
        )}
      </div>
    </div>
  );
}
