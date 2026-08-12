import { useEffect, useState } from "react";
import type { AuditLog } from "../../api/learningApi";

const PAGE_SIZE = 20;

const actionText = (log: AuditLog) => {
  const name = log.entity_type.replace("_", " ");
  const action = log.action.replaceAll("_", " ");
  const details =
    typeof log.new_value === "object" && log.new_value !== null
      ? (log.new_value as Record<string, unknown>)
      : {};

  if (typeof details.title === "string")
    return `${name} "${details.title}" was ${action}.`;
  if (typeof details.question_text === "string")
    return `A question was ${action}.`;
  if (typeof details.result === "string")
    return `An attempt was ${action} as ${details.result}.`;
  if (typeof details.created_concepts === "object")
    return "A source was processed and new concept suggestions were created.";
  if (typeof details.question_count === "number")
    return `A study session with ${details.question_count} questions was started.`;

  return `${name.charAt(0).toUpperCase() + name.slice(1)} was ${action}.`;
};

export function AuditPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(auditLogs.length / PAGE_SIZE);
  const firstLog = page * PAGE_SIZE;
  const visibleLogs = auditLogs.slice(firstLog, firstLog + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [auditLogs]);

  return (
    <div className="max-w-4xl">
      <div>
        <p className="text-sm font-semibold text-indigo-600">ACTIVITY HISTORY</p>
        <h2 className="mt-1 text-2xl font-bold">What happened in this module</h2>
        <p className="mt-2 text-sm text-slate-600">
          A simple timeline of your study material, reviews, and progress.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {visibleLogs.length ? (
          visibleLogs.map((log) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5"
              key={log.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="font-semibold text-slate-900">{actionText(log)}</p>
                <p className="shrink-0 text-sm text-slate-500 sm:text-right">
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">
            No activity has been recorded for this module yet.
          </p>
        )}
      </div>

      {auditLogs.length > PAGE_SIZE && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Showing {firstLog + 1}-{Math.min(firstLog + PAGE_SIZE, auditLogs.length)} of {auditLogs.length}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
              type="button"
            >
              &lt; Previous
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === totalPages - 1}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next &gt;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
