import type { AuditLog } from "../../api/learningApi";

const actionText = (log: AuditLog) => {
  const name = log.entity_type.replace("_", " ");
  const action = log.action.replaceAll("_", " ");
  const details =
    typeof log.new_value === "object" && log.new_value !== null
      ? (log.new_value as Record<string, unknown>)
      : {};
  if (typeof details.title === "string")
    return `${name} “${details.title}” was ${action}.`;
  if (typeof details.question_text === "string")
    return `A question was ${action}.`;
  if (typeof details.result === "string")
    return `An attempt was ${action} as ${details.result}.`;
  if (typeof details.created_concepts === "object")
    return `A source was processed and new concept suggestions were created.`;
  if (typeof details.question_count === "number")
    return `A study session with ${details.question_count} questions was started.`;
  return `${name.charAt(0).toUpperCase() + name.slice(1)} was ${action}.`;
};

export function AuditPanel({
  auditLogs,
}: {
  auditLogs: AuditLog[];
}) {
  return (
    <div className="max-w-4xl">
      <div>
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            ACTIVITY HISTORY
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            What happened in this module
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            A simple timeline of your study material, reviews, and progress.
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {auditLogs.length ? (
          auditLogs.map((log) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5"
              key={log.id}
            >
              <p className="font-semibold text-slate-900">{actionText(log)}</p>
              <p className="mt-2 text-sm text-slate-500">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </article>
          ))
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">
            No activity has been recorded for this module yet.
          </p>
        )}
      </div>
    </div>
  );
}
