import { useState } from "react";
import {
  getConceptVersions,
  mergeConcepts,
  reviewConcept,
  type Concept,
  type ConceptVersion,
} from "../../api/learningApi";

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
    // if (conceptVersions[conceptId]) return;
    try {
      const history = await getConceptVersions(conceptId);
      setConceptVersions((current) => ({ ...current, [conceptId]: history }));
    } catch {
      onMessage("Unable to load concept version history.");
    }
  };

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
    <div className="max-w-4xl">
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
      <div className="mt-6 space-y-3">
        {visibleConcepts.length ? (
          visibleConcepts.map((concept) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5"
              key={concept.id}
            >
              {editingId === concept.id ? (
                <>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base font-semibold outline-none focus:border-indigo-500"
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                  <textarea
                    className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
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
                  <div className="flex items-start justify-between gap-4">
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
                    loadConceptVersions(concept.id)
                    const history = conceptVersions[concept.id];
                    const currentVersion = history?.current_version ?? 1;
                    const viewedVersion =
                      selectedVersion[concept.id] ?? currentVersion;
                    const viewedConcept = history?.versions.find(
                      (version) => version.version === viewedVersion,
                    );
                    
                    return (
                      <div className="mt-3">
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                          onChange={(event) =>
                            setSelectedVersion((current) => ({
                              ...current,
                              [concept.id]: Number(event.target.value),
                            }))
                          }
                          // onFocus={() => void loadConceptVersions(concept.id)}
                          value={viewedVersion}
                        >
                          {(
                            history?.versions ?? [
                              {
                                version: 1,
                                title: concept.title,
                                definition: concept.definition,
                                created_at: "",
                              },
                            ]
                          ).map((version) => (
                            <option
                              key={version.version}
                              value={version.version}
                            >
                              Version {version.version}
                              {version.version === currentVersion
                                ? " (current)"
                                : ""}
                            </option>
                          ))}
                        </select>
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
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                        <label className="text-xs font-semibold text-slate-500">
                          Merge into
                        </label>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
                          onChange={(event) =>
                            setMergeTargetId((current) => ({
                              ...current,
                              [concept.id]: event.target.value,
                            }))
                          }
                          value={mergeTargetId[concept.id] ?? ""}
                        >
                          <option value="">Choose a concept</option>
                          {activeConcepts
                            .filter((target) => target.id !== concept.id)
                            .map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.title}
                              </option>
                            ))}
                        </select>
                        <button
                          className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
                          disabled={isWorking}
                          onClick={() => void mergeInto(concept.id)}
                          type="button"
                        >
                          Merge
                        </button>
                      </div>
                  </>
                </>
              )}
            </article>
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
