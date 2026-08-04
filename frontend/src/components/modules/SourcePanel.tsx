import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Module } from "../../api/contentApi";
import {
  createPdfSource,
  createSource,
  createSourceVersion,
  getSourceVersions,
  importSourceUrl,
  processSource,
  type Source,
  type SourceVersion,
} from "../../api/learningApi";

type SourcePanelProps = {
  module: Module;
  sources: Source[];
  onSourcesChanged: () => Promise<void>;
  onProcessed: () => Promise<void>;
  onMessage: (message: string) => void;
};

type SourceMode = "text" | "pdf" | "link";

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Unable to read this file."));
    reader.readAsDataURL(file);
  });

export function SourcePanel({
  module,
  sources,
  onSourcesChanged,
  onProcessed,
  onMessage,
}: SourcePanelProps) {
  const [mode, setMode] = useState<SourceMode>("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [sourceVersions, setSourceVersions] = useState<
    Record<string, SourceVersion[]>
  >({});
  const [selectedVersion, setSelectedVersion] = useState<
    Record<string, number>
  >({});
  const [isWorking, setIsWorking] = useState(false);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    if (selectedFile && selectedFile.type !== "application/pdf") {
      onMessage("Please choose a PDF file.");
      return;
    }
    if (selectedFile && selectedFile.size > 8 * 1024 * 1024) {
      onMessage("PDF files must be 8 MB or smaller.");
      return;
    }
    setFile(selectedFile);
    if (selectedFile && !title)
      setTitle(selectedFile.name.replace(/\.pdf$/i, ""));
  };

  const saveSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsWorking(true);
    try {
      if (mode === "text") {
        if (!text.trim()) return;
        await createSource({
          module_id: module.id,
          title: title.trim(),
          raw_text: text.trim(),
        });
      }
      if (mode === "pdf") {
        if (!file) return;
        await createPdfSource({
          module_id: module.id,
          title: title.trim(),
          file_data: await toBase64(file),
        });
      }
      if (mode === "link") {
        if (!url.trim()) return;
        await importSourceUrl({
          module_id: module.id,
          title: title.trim(),
          source_url: url.trim(),
        });
      }
      setTitle("");
      setText("");
      setUrl("");
      setFile(null);
      await onSourcesChanged();
      onMessage(
        "Source saved. Select Process to create AI concept suggestions.",
      );
    } catch {
      onMessage(
        "Unable to save this source. Check the file or link and try again.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const process = async (sourceId: string) => {
    setIsWorking(true);
    try {
      await processSource(sourceId);
      // await onSourcesChanged();
      await onProcessed();
      onMessage("Concept suggestions are ready for review.");
    } catch {
      onMessage(
        "Processing failed. Confirm the backend is running and Gemini is configured.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const startEditing = (source: Source) => {
    setEditingSourceId(source.id);
    setEditedText(source.raw_text ?? "");
  };

  const loadSourceVersions = async (sourceId: string) => {
    // if (sourceVersions[sourceId]) return;
    try {
      const versions = await getSourceVersions(sourceId);
      setSourceVersions((current) => ({ ...current, [sourceId]: versions }));
    } catch {
      onMessage("Unable to load source version history.");
    }
  };

  const saveNewVersion = async (sourceId: string) => {
    if (!editedText.trim()) {
      onMessage("A source version needs some text to save.");
      return;
    }

    setIsWorking(true);
    try {
      if (text.trim() != editedText.trim()) {
        await createSourceVersion(sourceId, editedText.trim());
        setEditingSourceId(null);
        setEditedText("");
        await onSourcesChanged();
        await onProcessed();
        onMessage(
          "Version saved. Existing concepts are marked outdated until you process and review the new version.",
        )
      } else {
        onMessage("You didn't edited the source")
      }

    } catch {
      onMessage("Unable to save this source version.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <form
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(event) => void saveSource(event)}
      >
        <p className="text-sm font-semibold text-indigo-600">ADD SOURCE</p>
        <h2 className="mt-1 text-xl font-bold">Bring in your study material</h2>
        <div className="mt-5 flex gap-2 rounded-xl bg-slate-100 p-1">
          {(["text", "pdf", "link"] as SourceMode[]).map((item) => (
            <button
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === item ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
              key={item}
              onClick={() => setMode(item)}
              type="button"
            >
              {item === "text"
                ? "Paste text"
                : item === "pdf"
                  ? "PDF file"
                  : "Web link"}
            </button>
          ))}
        </div>
        <input
          className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Source title"
          value={title}
        />
        {mode === "text" && (
          <textarea
            className="mt-3 min-h-56 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-indigo-500"
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste your notes here…"
            value={text}
          />
        )}
        {mode === "pdf" && (
          <label className="mt-3 grid min-h-40 cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
            <span>
              <strong className="block text-slate-700">
                {file?.name ?? "Choose a PDF file"}
              </strong>
              <span className="mt-1 block">
                PDF files up to 8 MB are analyzed directly by Gemini.
              </span>
            </span>
            <input
              accept="application/pdf"
              className="sr-only"
              onChange={chooseFile}
              type="file"
            />
          </label>
        )}
        {mode === "link" && (
          <input
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/article or document.pdf"
            type="url"
            value={url}
          />
        )}
        <button
          className="mt-3 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isWorking}
          type="submit"
        >
          {isWorking ? "Saving…" : "Save source"}
        </button>
      </form>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-indigo-600">SAVED SOURCES</p>
        <h2 className="mt-1 text-xl font-bold">Process into concepts</h2>
        <div className="mt-5 space-y-3">
          {sources.length ? (
            sources.map((source) => (
              <article
                className="rounded-xl border border-slate-200 p-4"
                key={source.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{source.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {source.source_type.toUpperCase()} · Version{" "}
                      {source.current_version} · {source.status == "needs_review" ? '' : source.status}
                    </p>
                    <select
                      className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      onChange={(event) =>
                        setSelectedVersion((current) => ({
                          ...current,
                          [source.id]: Number(event.target.value),
                        }))
                      }
                      onFocus={() => void loadSourceVersions(source.id)}
                      value={
                        selectedVersion[source.id] ?? source.current_version
                      }
                    >
                      {(
                        sourceVersions[source.id] ?? [
                          {
                            id: source.id,
                            version: source.current_version,
                            raw_text: source.raw_text,
                            created_at: "",
                          },
                        ]
                      ).map((version) => (
                        <option key={version.id} value={version.version}>
                          Version {version.version}
                          {version.version === source.current_version
                            ? " (current)"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    {source.source_type === "paste" && (
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                        disabled={isWorking}
                        onClick={() => startEditing(source)}
                        type="button"
                      >
                        Edit source
                      </button>
                    )}
                    <button
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={isWorking}
                      onClick={() => void process(source.id)}
                      type="button"
                    >
                      Process
                    </button>
                  </div>
                </div>
                {(() => {
                  const chosenVersion = (sourceVersions[source.id] ?? []).find(
                    (version) =>
                      version.version ===
                      (selectedVersion[source.id] ?? source.current_version),
                  );
                  const versionText =
                    chosenVersion?.raw_text ?? source.raw_text;
                  return versionText ? (
                    <textarea
                      className="mt-4 min-h-24 w-full rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
                      readOnly
                      value={versionText}
                    />
                  ) : null;
                })()}
                {editingSourceId === source.id && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="text-sm font-semibold">
                      Create version {source.current_version + 1}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Saving does not erase accepted edits. It marks concepts
                      from this source outdated until the new version is
                      processed and reviewed.
                    </p>
                    <textarea
                      className="mt-3 min-h-40 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-500"
                      onChange={(event) => setEditedText(event.target.value)}
                      value={editedText}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={isWorking}
                        onClick={() => void saveNewVersion(source.id)}
                        type="button"
                      >
                        Save new version
                      </button>
                      <button
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500"
                        onClick={() => setEditingSourceId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No sources in this module yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
