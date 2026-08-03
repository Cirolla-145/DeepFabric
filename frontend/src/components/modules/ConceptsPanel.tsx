import { useState } from "react";
import { reviewConcept, type Concept } from "../../api/learningApi";

type ConceptsPanelProps = {
  concepts: Concept[];
  onConceptUpdated: (conceptId: string, changes: Partial<Concept>) => void;
  onMessage: (message: string) => void;
};

export function ConceptsPanel({
  concepts,
  onConceptUpdated,
  onMessage,
}: ConceptsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [definition, setDefinition] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const visibleConcepts = concepts.filter(
    (concept) => concept.status !== "rejected",
  );

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
        status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "edited",
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
                      {concept.status}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {concept.status === "suggested" && (
                      <button
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={isWorking}
                        onClick={() => void applyReview(concept.id, "accept")}
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
