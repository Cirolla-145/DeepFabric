import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const sourceListRef = useRef<HTMLDivElement>(null);
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);

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
    } catch (error: any) {
      onMessage(
        error.response?.data?.message ??
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
    if (sourceVersions[sourceId]) return;
    try {
      const versions = await getSourceVersions(sourceId);
      setSourceVersions((current) => ({ ...current, [sourceId]: versions }));
    } catch {
      onMessage("Unable to load source version history.");
    }
  };

  useEffect(() => {
    sources.forEach((source) => void loadSourceVersions(source.id));
  }, [sources]);

  useEffect(() => {
    setFocusedSourceId(sources[0]?.id ?? null);
  }, [sources]);

  const updateFocusedSource = () => {
    const list = sourceListRef.current;
    if (!list) return;

    const listTop = list.getBoundingClientRect().top;
    const cards = Array.from(
      list.querySelectorAll<HTMLElement>("[data-source-id]"),
    );
    const firstVisibleCard = cards.find(
      (card) => card.getBoundingClientRect().bottom > listTop,
    );

    setFocusedSourceId(firstVisibleCard?.dataset.sourceId ?? null);
  };

  const scrollSources = (direction: "up" | "down") => {
    sourceListRef.current?.scrollBy({
      top: direction === "up" ? -180 : 180,
      behavior: "smooth",
    });
  };

  const saveNewVersion = async (source: Source) => {
    if (!editedText.trim()) {
      onMessage("A source version needs some text to save.");
      return;
    }

    setIsWorking(true);
    try {
      if (source.raw_text?.trim() !== editedText.trim()) {
        await createSourceVersion(source.id, editedText.trim());
        setEditingSourceId(null);
        setEditedText("");
        await onSourcesChanged();
        await onProcessed();
        const versions = await getSourceVersions(source.id);
        const currentVersion = source.current_version + 1;
        setSourceVersions((current) => ({ ...current, [source.id]: versions }));
        setSelectedVersion((current) => ({
          ...current,
          [source.id]: currentVersion,
        }));
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
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(event) => void saveSource(event)}
      >
        <p className="text-sm font-semibold text-indigo-600">ADD SOURCE</p>
        <h2 className="mt-1 text-xl font-bold">Bring in your study material</h2>
        <div className="mt-5 flex gap-1 rounded-xl bg-slate-100 p-1 sm:gap-2">
          {(["text", "pdf", "link"] as SourceMode[]).map((item) => (
            <button
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${mode === item ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-sm font-semibold text-indigo-600">SAVED SOURCES</p>
        <h2 className="mt-1 text-xl font-bold">Process into concepts</h2>
        <div className="relative mt-5">
          <button
            aria-label="Show previous source"
            className="absolute top-2 right-1 z-10 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
            onClick={() => scrollSources("up")}
            type="button"
          >
            <ChevronUp className="size-4" />
          </button>
          <div
            className="max-h-[55vh] snap-y snap-mandatory space-y-5 overflow-y-auto px-2 pt-2 pr-10 pb-72 sm:max-h-[24rem] sm:px-4 sm:pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={updateFocusedSource}
            ref={sourceListRef}
          >
          {sources.length ? (
            sources.map((source) => (
              <article
                className={`snap-start snap-always rounded-xl border bg-white p-4 transition-all duration-300 ${
                  focusedSourceId === source.id
                    ? "scale-100 border-indigo-200 shadow-md"
                    : "scale-[0.96] border-slate-200 opacity-55"
                }`}
                data-source-id={source.id}
                key={source.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{source.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {source.source_type.toUpperCase()} · Version{" "}
                      {source.current_version} · {source.status == "needs_review" ? '' : source.status}
                    </p>
                    {source.source_type !== "pdf" && (
                      <Select
                        onValueChange={(value) =>
                          setSelectedVersion((current) => ({
                            ...current,
                            [source.id]: Number(value),
                          }))
                        }
                        value={String(
                          selectedVersion[source.id] ?? source.current_version,
                        )}
                      >
                        <SelectTrigger className="mt-2" size="sm">
                          <SelectValue>
                            Version {selectedVersion[source.id] ?? source.current_version}
                            {(selectedVersion[source.id] ?? source.current_version) ===
                            source.current_version
                              ? " (current)"
                              : ""}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(sourceVersions[source.id] ?? [
                            {
                              id: source.id,
                              version: source.current_version,
                              raw_text: source.raw_text,
                              created_at: "",
                            },
                          ]).map((version) => (
                            <SelectItem
                              key={version.id}
                              value={String(version.version)}
                            >
                              Version {version.version}
                              {version.version === source.current_version
                                ? " (current)"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
                      onClick={() => void saveNewVersion(source)}
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
          <button
            aria-label="Show next source"
            className="absolute right-1 bottom-2 z-10 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
            onClick={() => scrollSources("down")}
            type="button"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
