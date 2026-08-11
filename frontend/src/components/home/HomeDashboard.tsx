import { useEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import {
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { HomeInsights } from "../../api/learningApi";

type ActivityDay = HomeInsights["activity"][number] & { key: string };

const difficultyLevels = [
  { id: "easy", label: "Easy", color: "#22c55e" },
  { id: "medium", label: "Medium", color: "#f59e0b" },
  { id: "hard", label: "Hard", color: "#ef4444" },
] as const;

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function CorrectAnswerTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-slate-900">
        {item.label}: {item.value}
      </p>
      <p className="text-slate-500">Correct answers</p>
    </div>
  );
}

export function HomeDashboard({ insights }: { insights: HomeInsights | null }) {
  const [hoveredDay, setHoveredDay] = useState<ActivityDay | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const heatmapRef = useRef<HTMLDivElement>(null);
  const showDayTooltip = (day: ActivityDay, x: number, y: number) => {
    setHoveredDay(day);
    setTooltipPosition({
      x: Math.min(x + 14, window.innerWidth - 250),
      y: Math.min(y + 14, window.innerHeight - 90),
    });
  };
  const chartData = difficultyLevels.map((level) => ({
    ...level,
    value: Number(insights?.difficulty_counts[level.id] ?? 0),
  }));
  const totalCorrect = Number(insights?.total_correct ?? 0);
  const activityDays = useMemo(() => {
    const recordedDays = new Map(
      insights?.activity.map((day) => [String(day.date).slice(0, 10), day]) ?? [],
    );
    const days: ActivityDay[] = [];
    const today = new Date();

    for (let index = 364; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      const key = dateKey(date);
      const recorded = recordedDays.get(key);
      days.push({
        key,
        date: key,
        sessions: Number(recorded?.sessions ?? 0),
        correct_answers: Number(recorded?.correct_answers ?? 0),
      });
    }
    return days;
  }, [insights]);
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; days: ActivityDay[] }> = [];

    activityDays.forEach((day) => {
      const label = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
      });
      const group = groups[groups.length - 1];

      if (!group || group.label !== label) groups.push({ label, days: [day] });
      else group.days.push(day);
    });

    return groups;
  }, [activityDays]);

  useEffect(() => {
    const heatmap = heatmapRef.current;
    if (heatmap) heatmap.scrollLeft = heatmap.scrollWidth;
  }, [monthGroups]);

  const biggestActivity = Math.max(
    1,
    ...activityDays.map((day) => day.sessions + day.correct_answers),
  );
  const currentStreak = (() => {
    let days = 0;
    for (let index = activityDays.length - 1; index >= 0; index -= 1) {
      const day = activityDays[index];
      if (day.sessions + day.correct_answers === 0) break;
      days += 1;
    }
    return days;
  })();
  const attemptCounts = insights?.attempt_counts ?? {
    correct: 0,
    incorrect: 0,
    partial: 0,
  };
  const totalQuestions =
    attemptCounts.correct + attemptCounts.incorrect + attemptCounts.partial;

  if (!insights?.has_activity) {
    return (
      <section className="grid h-full place-items-center bg-slate-50 p-8 text-center">
        <div>
          <p className="text-sm font-semibold text-indigo-600">SELECT A MODULE</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Your study workspace will appear here.
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-slate-600">
            Choose a module from the sidebar, or create one inside a subject to
            start adding study material.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-full overflow-y-auto bg-slate-50 p-4 sm:p-7">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold text-indigo-600">YOUR LEARNING</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          Study activity overview
        </h1>
        <p className="mt-2 text-slate-600">
          Your correct answers and activity across every workspace.
        </p>

        <div className="mt-7 space-y-5">
          <article className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-semibold text-slate-900">Current status</h2>
            <p className="mt-1 text-sm text-slate-500">
              Your overall answer summary across all workspaces.
            </p>

            <div className="mt-5 flex flex-col items-center justify-center gap-6 sm:flex-row sm:items-stretch">
              <div className="w-full max-w-sm">
                <div className="h-60">
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Tooltip content={<CorrectAnswerTooltip />} cursor={false} />
                      <Pie
                        data={chartData}
                        dataKey="value"
                        innerRadius={72}
                        outerRadius={104}
                        paddingAngle={4}
                        stroke="#ffffff"
                        strokeWidth={4}
                      >
                        {chartData.map((item) => (
                          <Cell fill={item.color} key={item.id} />
                        ))}
                        <Label
                          content={({ viewBox }) => {
                            if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                            return (
                              <text textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                                <tspan className="fill-slate-950 text-3xl font-bold" x={viewBox.cx} y={viewBox.cy}>
                                  {totalCorrect}
                                </tspan>
                                <tspan className="fill-slate-500 text-sm" x={viewBox.cx} y={(viewBox.cy ?? 0) + 23}>
                                  correct
                                </tspan>
                              </text>
                            );
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-sm">
                  {chartData.map((item) => (
                    <div key={item.id}>
                      <span className="mx-auto mb-1 block size-2 rounded-full" style={{ background: item.color }} />
                      <p className="font-semibold text-slate-900">{item.value}</p>
                      <p className="text-slate-500">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid w-full max-w-sm grid-cols-2 gap-3 self-center rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-sm text-slate-500">Total questions</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{totalQuestions}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-sm text-emerald-700">Answered correctly</p>
                  <p className="mt-1 text-xl font-bold text-emerald-800">{attemptCounts.correct}</p>
                </div>
                <div className="rounded-xl bg-rose-50 p-3">
                  <p className="text-sm text-rose-700">Answered incorrectly</p>
                  <p className="mt-1 text-xl font-bold text-rose-800">{attemptCounts.incorrect}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-sm text-amber-700">Partial answers</p>
                  <p className="mt-1 text-xl font-bold text-amber-800">{attemptCounts.partial}</p>
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-xl bg-indigo-50 p-3">
                  <p className="text-sm text-indigo-700">Total sessions</p>
                  <p className="text-xl font-bold text-indigo-800">{insights.total_sessions}</p>
                </div>
              </div>
            </div>
          </article>

          <article className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Activity</h2>
                <p className="mt-1 text-sm text-slate-500">Your last 365 days of study.</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700">
                <Flame className="size-4" />
                {currentStreak} day streak
              </div>
            </div>

            <div
              className="mt-6 overflow-x-auto pb-2"
              onMouseLeave={() => setHoveredDay(null)}
              ref={heatmapRef}
            >
              <div className="flex w-max gap-3">
                {monthGroups.map((month, groupIndex) => (
                  <div
                    className={groupIndex === 0 ? "" : "border-l border-slate-200 pl-3"}
                    key={`${month.label}-${groupIndex}`}
                  >
                    <p className="mb-2 text-xs font-medium text-slate-500">{month.label}</p>
                    <div className="grid grid-flow-col grid-rows-7 gap-1">
                      {month.days.map((day) => {
                        const value = day.sessions + day.correct_answers;
                        const intensity = value / biggestActivity;
                        const color =
                          value === 0
                            ? "bg-slate-100"
                            : intensity > 0.7
                              ? "bg-indigo-600"
                              : intensity > 0.35
                                ? "bg-indigo-400"
                                : "bg-indigo-200";
                        return (
                          <button
                            aria-label={`${formatDate(day.date)}: ${day.sessions} sessions, ${day.correct_answers} correct answers`}
                            className={`size-3.5 rounded-sm transition-transform hover:scale-125 focus:scale-125 focus:outline-none ${color}`}
                            key={day.key}
                            onMouseEnter={(event) => showDayTooltip(day, event.clientX, event.clientY)}
                            onMouseMove={(event) => showDayTooltip(day, event.clientX, event.clientY)}
                            onFocus={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              showDayTooltip(day, rect.right, rect.bottom);
                            }}
                            onBlur={() => setHoveredDay(null)}
                            type="button"
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </article>
        </div>
      </div>

      {hoveredDay && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg"
          style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
        >
          <p className="font-medium text-slate-900">{formatDate(hoveredDay.date)}</p>
          <p className="mt-1 text-slate-600">
            {hoveredDay.sessions} session{hoveredDay.sessions === 1 ? "" : "s"} · {hoveredDay.correct_answers} correct answer{hoveredDay.correct_answers === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </section>
  );
}
