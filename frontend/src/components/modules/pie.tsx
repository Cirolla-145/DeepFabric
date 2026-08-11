import * as React from "react";
import { Cell, Label, Pie as RechartsPie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieSectorDataItem } from "recharts";
import type { Concept, Insights } from "../../api/learningApi";

type PieProps = {
  distribution: Insights["mastery_distribution"];
  concepts: Concept[];
};

const masteryLevels = [
  { id: "new", label: "New", color: "#94a3b8" },
  { id: "learning", label: "Learning", color: "#6366f1" },
  { id: "proficient", label: "Proficient", color: "#f59e0b" },
  { id: "mastered", label: "Mastered", color: "#10b981" },
] as const;

const masteryBucket = (score: number | null) => {
  const value = score ?? 0;
  if (value < 25) return "new";
  if (value < 50) return "learning";
  if (value < 75) return "proficient";
  return "mastered";
};

function MasteryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;
  const names = item.conceptNames as string[];

  return (
    <div className="max-w-xs rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="font-semibold">
        {item.label}: {item.value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Concepts in this level</p>
      <ul className="mt-2 space-y-1 text-xs">
        {names.slice(0, 5).map((name) => (
          <li key={name}>{name}</li>
        ))}
        {names.length > 5 && <li>+{names.length - 5} more</li>}
        {!names.length && <li>No concepts yet.</li>}
      </ul>
    </div>
  );
}

export function Pie({ distribution, concepts }: PieProps) {
  const data = masteryLevels.map((level) => ({
    ...level,
    value: Number(distribution[`${level.id}_count`]) || 0,
    conceptNames: concepts
      .filter(
        (concept) =>
          ["accepted", "edited", "merged"].includes(concept.status) &&
          !concept.is_outdated &&
          masteryBucket(concept.mastery_score) === level.id,
      )
      .map((concept) => concept.title),
  }));
  const [activeLevel, setActiveLevel] = React.useState(data.find((item) => item.value > 0)?.id ?? data[0].id);
  const activeItem = data.find((item) => item.id === activeLevel) ?? data[0];
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const renderPieShape = React.useCallback(
    ({ outerRadius = 0, ...props }: PieSectorDataItem) => {
      const item = props.payload as { id?: string } | undefined;

      if (item?.id === activeLevel) {
        return (
          <g>
            <Sector {...props} outerRadius={outerRadius + 7} />
            <Sector
              {...props}
              innerRadius={outerRadius + 10}
              outerRadius={outerRadius + 16}
            />
          </g>
        );
      }

      return <Sector {...props} outerRadius={outerRadius} />;
    },
    [activeLevel],
  );

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold">Mastery distribution</p>
          <p className="mt-1 text-sm text-muted-foreground">Hover a chart section to see its concepts.</p>
        </div>
      </div>

      <div className="h-64 px-2 pb-4 sm:h-80 sm:px-4 sm:pb-6">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Tooltip content={<MasteryTooltip />} cursor={false} />
            <RechartsPie
              data={data}
              dataKey="value"
              innerRadius={72}
              nameKey="label"
              onMouseEnter={(_data: unknown, index: number) => {
                const item = data[index];
                if (item) setActiveLevel(item.id);
              }}
              outerRadius={105}
              paddingAngle={3}
              shape={renderPieShape}
              stroke="var(--card)"
              strokeWidth={4}
            >
              {data.map((item) => (
                <Cell fill={item.color} key={item.id} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                    return null;
                  }

                  return (
                    <text
                      dominantBaseline="middle"
                      textAnchor="middle"
                      x={viewBox.cx}
                      y={viewBox.cy}
                    >
                      <tspan
                        className="fill-foreground text-3xl font-bold"
                        x={viewBox.cx}
                        y={viewBox.cy}
                      >
                        {activeItem.value}
                      </tspan>
                      <tspan
                        className="fill-muted-foreground text-sm"
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 24}
                      >
                        {activeItem.label}
                      </tspan>
                    </text>
                  );
                }}
              />
            </RechartsPie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t px-6 py-4 text-sm text-muted-foreground">
        {total} active concept{total === 1 ? "" : "s"} across this module.
      </div>
    </section>
  );
}
