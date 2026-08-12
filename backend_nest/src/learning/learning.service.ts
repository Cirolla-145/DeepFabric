import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { DatabaseService } from "../database/database.service";

const json = (value: any, fallback: any = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};
const stringJson = (value: any) =>
  value === null || value === undefined ? null : JSON.stringify(value);
const text = (value: any) =>
  String(value ?? "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
const dayKey = (value: any) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const MAX_CONCEPTS_PER_SOURCE = 6;
const consolidateConcepts = (items: any[]) => {
  const conceptsByTitle = new Map<string, any>();

  for (const item of items) {
    const title = text(item.title);
    const definition = text(item.definition);
    const key = title.toLowerCase();

    if (!title || !definition || conceptsByTitle.has(key)) continue;

    conceptsByTitle.set(key, {
      ...item,
      title,
      definition,
      facts: Array.isArray(item.facts) ? item.facts.slice(0, 5) : [],
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 3) : [],
    });
  }

  return [...conceptsByTitle.values()].slice(0, MAX_CONCEPTS_PER_SOURCE);
};
const hash = (q: any) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        concept_id: q.concept_id,
        question_type: q.question_type,
        question_text: q.question_text.trim().toLowerCase(),
        correct_answer: q.correct_answer.trim().toLowerCase(),
      }),
    )
    .digest("hex");

@Injectable()
export class LearningService {
  constructor(private readonly db: DatabaseService) {}

  private async audit(
    userId: string,
    entityType: string,
    entityId: string,
    action: string,
    after: any,
    before: any = null,
  ) {
    await this.db.query(
      "INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        await this.db.id(),
        userId,
        entityType,
        entityId,
        action,
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
      ],
    );
  }
  private async ownsModule(moduleId: string, userId: string) {
    return (
      (
        await this.db.query(
          "SELECT m.id FROM modules m JOIN subjects s ON s.id=m.subject_id JOIN workspaces w ON w.id=s.workspace_id WHERE m.id=? AND w.user_id=?",
          [moduleId, userId],
        )
      ).length > 0
    );
  }
  private async source(sourceId: string, userId: string) {
    const rows = await this.db.query<any>(
      "SELECT src.* FROM sources src JOIN modules m ON m.id=src.module_id JOIN subjects s ON s.id=m.subject_id JOIN workspaces w ON w.id=s.workspace_id WHERE src.id=? AND w.user_id=?",
      [sourceId, userId],
    );
    return rows[0];
  }
  private async concept(conceptId: string, userId: string) {
    const rows = await this.db.query<any>(
      "SELECT c.* FROM concepts c JOIN modules m ON m.id=c.module_id JOIN subjects s ON s.id=m.subject_id JOIN workspaces w ON w.id=s.workspace_id WHERE c.id=? AND w.user_id=?",
      [conceptId, userId],
    );
    return rows[0];
  }
  private async aiJson(instruction: string, input: any) {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
        contents: Array.isArray(input)
          ? input
          : typeof input === "string"
            ? input
            : JSON.stringify(input),
        config: {
          systemInstruction: instruction,
          responseMimeType: "application/json",
        },
      });
      return {
        data: JSON.parse(
          response.text
            .replace(/^```json\s*/i, "")
            .replace(/```$/i, "")
            .trim(),
        ),
        model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
      };
    } catch {
      return null;
    }
  }
  private async aiRun(
    userId: string,
    type: "concept_extraction" | "question_generation" | "grading",
    model: string,
    prompt: string,
    input: any,
    output: any,
  ) {
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO ai_runs (id,user_id,run_type,model,prompt_version,input_data,output_data) VALUES (?,?,?,?,?,?,?)",
      [
        id,
        userId,
        type,
        model,
        prompt,
        JSON.stringify(input),
        JSON.stringify(output),
      ],
    );
    return id;
  }

  async createSource(userId: string, body: any) {
    const {
      module_id,
      title,
      source_type = "paste",
      raw_text,
      file_data,
      source_url,
    } = body;
    if (!module_id || !title || (!raw_text && !file_data && !source_url))
      throw new BadRequestException(
        "module_id, title, and source content are required",
      );
    if (!(await this.ownsModule(module_id, userId)))
      throw new NotFoundException("Module not found");
    let content = file_data ?? raw_text;
    let type = file_data ? "pdf" : source_type;
    if (source_url) {
      let url: URL;
      try {
        url = new URL(source_url);
      } catch {
        throw new BadRequestException("Provide a valid public URL");
      }
      if (!["http:", "https:"].includes(url.protocol))
        throw new BadRequestException("Only http and https URLs are supported");
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok)
        throw new BadRequestException(
          "Unable to download content from this URL",
        );
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024)
        throw new BadRequestException("URL content must be 8 MB or smaller");
      const isPdf =
        response.headers.get("content-type")?.includes("application/pdf") ||
        url.pathname.toLowerCase().endsWith(".pdf");
      type = isPdf ? "pdf" : "paste";
      content = isPdf
        ? Buffer.from(bytes).toString("base64")
        : Buffer.from(bytes)
            .toString("utf8")
            .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    const id = await this.db.id();
    const versionId = await this.db.id();
    await this.db.query(
      "INSERT INTO sources (id,module_id,title,source_type,current_version,status) VALUES (?,?,?,?,1,'draft')",
      [id, module_id, title, type],
    );
    await this.db.query(
      "INSERT INTO source_versions (id,source_id,version,raw_text) VALUES (?,?,1,?)",
      [versionId, id, content],
    );
    await this.audit(userId, "source", id, "created", {
      title,
      source_type: type,
      version: 1,
    });
    return {
      message: "Source created successfully",
      source: { id, current_version: 1 },
    };
  }
  async sourceVersion(userId: string, body: any) {
    const source = await this.source(body.source_id, userId);
    if (!source || !body.raw_text?.trim())
      throw new BadRequestException("source_id and raw_text are required");
    const old = await this.db.query<any>(
      "SELECT id,version,raw_text FROM source_versions WHERE source_id=? AND version=?",
      [source.id, source.current_version],
    );
    const version = source.current_version + 1;
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO source_versions (id,source_id,version,raw_text) VALUES (?,?,?,?)",
      [id, source.id, version, body.raw_text],
    );
    await this.db.query(
      "UPDATE sources SET current_version=?, status='needs_review' WHERE id=?",
      [version, source.id],
    );
    await this.db.query(
      "UPDATE concepts c JOIN source_versions sv ON sv.id=c.source_version_id SET c.is_outdated=TRUE WHERE sv.source_id=?",
      [source.id],
    );
    await this.audit(
      userId,
      "source",
      source.id,
      "version_created",
      { version, raw_text: body.raw_text },
      old[0],
    );
    return {
      message: "Source version created; existing concepts now need review",
    };
  }
  async processSource(userId: string, sourceId: string) {
    const source = await this.source(sourceId, userId);
    if (!source) throw new NotFoundException("Source not found");
    const versions = await this.db.query<any>(
      "SELECT * FROM source_versions WHERE source_id=? AND version=?",
      [sourceId, source.current_version],
    );
    const version = versions[0];
    let input: any = version.raw_text;
    if (source.source_type === "pdf")
      input = [
        { text: "Extract study concepts from this PDF." },
        { inlineData: { mimeType: "application/pdf", data: version.raw_text } },
      ];
    const ai = await this.aiJson(
      'Return JSON only: {"concepts":[{"title":"specific topic name","definition":"2-4 sentence explanation that gives context and never repeats the title","facts":["fact"],"tags":["tag"],"source_excerpt":"supporting text"}]}. Create 4 to 6 meaningful, high-level study concepts for the entire source. Each concept must cover one coherent topic by combining related slides, repeated explanations, examples, and small subtopics. Do not create a concept for each slide, sentence, fact, or section heading. Avoid vague titles such as "Introduction", "Overview", or "Deep Dive". The definition must explain the topic clearly in plain language, not restate its title. Extract only concepts grounded in the source.',
      input,
    );
    if (source.source_type === "pdf" && !Array.isArray(ai?.data?.concepts)) {
      throw new BadRequestException(
        "AI could not process this PDF. Check GEMINI_API_KEY and try again.",
      );
    }
    const fallback = text(
      source.source_type === "pdf" ? "PDF study material" : version.raw_text,
    )
      .split(/[.!?]/)
      .filter((part) => part.trim().length > 30)
      .slice(0, 5)
      .map((part) => ({
        title: text(part).split(" ").slice(0, 6).join(" "),
        definition: text(part),
        facts: [text(part)],
        tags: [],
        source_excerpt: text(part),
      }));
    const concepts = consolidateConcepts(
      Array.isArray(ai?.data?.concepts) ? ai.data.concepts : fallback,
    );
    const runId = await this.aiRun(
      userId,
      "concept_extraction",
      ai?.model ?? "deterministic-local-v1",
      ai ? "concept-extraction-v1" : "fallback-concept-extraction-v1",
      { source_id: sourceId },
      { concept_count: concepts.length },
    );
    const existing = await this.db.query<any>(
      "SELECT id,title,status FROM concepts WHERE source_version_id=?",
      [version.id],
    );
    const created: any[] = [];
    for (const item of concepts) {
      const title = text(item.title);
      const definition = text(item.definition);
      if (!title || !definition) continue;
      const previous = existing.find(
        (row) => text(row.title).toLowerCase() === title.toLowerCase(),
      );
      if (previous?.status === "suggested") {
        await this.db.query(
          "UPDATE concepts SET title=?,definition=?,facts=?,tags=?,is_outdated=FALSE WHERE id=?",
          [
            title,
            definition,
            stringJson(item.facts ?? []),
            stringJson(item.tags ?? []),
            previous.id,
          ],
        );
        continue;
      }
      if (previous) continue;
      const id = await this.db.id();
      await this.db.query(
        "INSERT INTO concepts (id,module_id,source_version_id,source_excerpt,ai_run_id,title,definition,facts,tags,status) VALUES (?,?,?,?,?,?,?,?,?,'suggested')",
        [
          id,
          source.module_id,
          version.id,
          item.source_excerpt ?? "",
          runId,
          title,
          definition,
          stringJson(item.facts ?? []),
          stringJson(item.tags ?? []),
        ],
      );
      created.push({ id, title });
    }
    await this.db.query("UPDATE sources SET status='processed' WHERE id=?", [
      sourceId,
    ]);
    await this.audit(userId, "source", sourceId, "processed", {
      source_version_id: version.id,
      ai_run_id: runId,
      created_concepts: created,
    });
    return {
      message: "Source processed successfully",
      ai_run: { id: runId },
      created_concepts: created,
    };
  }

  async reviewConcept(userId: string, id: string, body: any) {
    const concept = await this.concept(id, userId);
    if (!concept) throw new NotFoundException("Concept not found");
    if (!["accept", "edit", "reject"].includes(body.action))
      throw new BadRequestException("Invalid concept action");
    const before = {
      title: concept.title,
      definition: concept.definition,
      facts: concept.facts,
      tags: concept.tags,
      status: concept.status,
      is_outdated: concept.is_outdated,
    };
    const after = {
      title: body.title === undefined ? concept.title : body.title,
      definition:
        body.definition === undefined ? concept.definition : body.definition,
      facts: body.facts === undefined ? concept.facts : body.facts,
      tags: body.tags === undefined ? concept.tags : body.tags,
      status:
        body.action === "accept"
          ? "accepted"
          : body.action === "edit"
            ? "edited"
            : "rejected",
      is_outdated: false,
    };
    await this.db.query(
      "UPDATE concepts SET title=?,definition=?,facts=?,tags=?,status=?,is_outdated=FALSE WHERE id=?",
      [
        after.title,
        after.definition,
        stringJson(after.facts),
        stringJson(after.tags),
        after.status,
        id,
      ],
    );
    await this.audit(userId, "concept", id, body.action, after, before);
    return {
      message: `Concept ${after.status} successfully`,
      concept: { id, ...after },
    };
  }
  async mergeConcepts(userId: string, id: string, targetId: string) {
    const first = await this.concept(id, userId);
    const second = await this.concept(targetId, userId);
    if (!first || !second || first.module_id !== second.module_id)
      throw new BadRequestException("Concepts must belong to the same module");
    const ai = await this.aiJson(
      'Combine these two concepts. Return JSON only: {"title":"string","definition":"detailed combined overview","facts":["string"],"tags":["string"]}.',
      [
        {
          title: first.title,
          definition: first.definition,
          facts: json(first.facts, []),
        },
        {
          title: second.title,
          definition: second.definition,
          facts: json(second.facts, []),
        },
      ],
    );
    const data = ai?.data ?? {
      title: `${first.title} and ${second.title}`,
      definition: `${first.definition} ${second.definition}`,
      facts: [...json(first.facts, []), ...json(second.facts, [])].slice(0, 8),
      tags: [],
    };
    const mergedId = await this.db.id();
    const runId = await this.aiRun(
      userId,
      "concept_extraction",
      ai?.model ?? "deterministic-local-v1",
      "concept-merge-v1",
      { concepts: [id, targetId] },
      data,
    );
    await this.db.query(
      "INSERT INTO concepts (id,module_id,source_version_id,source_excerpt,ai_run_id,title,definition,facts,tags,status) VALUES (?,?,?,?,?,?,?,?,?,'merged')",
      [
        mergedId,
        first.module_id,
        first.source_version_id,
        `Merged from: ${first.title}; ${second.title}`,
        runId,
        text(data.title),
        text(data.definition),
        stringJson(data.facts ?? []),
        stringJson(data.tags ?? []),
      ],
    );
    await this.db.query(
      "UPDATE questions SET concept_id=? WHERE concept_id IN (?,?) AND status IN ('generated','approved','edited')",
      [mergedId, id, targetId],
    );
    await this.db.query(
      "UPDATE concepts SET status='rejected',merged_into_concept_id=? WHERE id IN (?,?)",
      [mergedId, id, targetId],
    );
    await this.audit(userId, "concept", mergedId, "merged", {
      merged_from_concept_ids: [id, targetId],
      title: data.title,
    });
    await this.audit(
      userId,
      "concept",
      id,
      "rejected_for_merge",
      { status: "rejected", merged_into_concept_id: mergedId },
      first,
    );
    await this.audit(
      userId,
      "concept",
      targetId,
      "rejected_for_merge",
      { status: "rejected", merged_into_concept_id: mergedId },
      second,
    );
    return {
      message: "Concepts merged successfully",
      merged_concept: {
        id: mergedId,
        title: text(data.title),
        definition: text(data.definition),
        status: "merged",
        is_outdated: false,
        merged_into_concept_id: null,
        mastery_score: 0,
      },
    };
  }
  async generateQuestions(userId: string, moduleId: string) {
    if (!(await this.ownsModule(moduleId, userId)))
      throw new NotFoundException("Module not found");
    const concepts = await this.db.query<any>(
      "SELECT id,title,definition,facts FROM concepts WHERE module_id=? AND status IN ('accepted','edited','merged') AND is_outdated=FALSE",
      [moduleId],
    );
    const retiredQuestions = await this.db.query<any>(
      "SELECT question_text,correct_answer FROM questions WHERE module_id=? AND status='retired' ORDER BY updated_at DESC LIMIT 50",
      [moduleId],
    );
    const ai = await this.aiJson(
      'Create two useful, distinct questions for each concept. Return JSON only: {"questions":[{"concept_id":"string","question_type":"mcq|true_false|short_answer","question_text":"string","options":["string"],"correct_answer":"string","difficulty":1}]}. Do not repeat or closely paraphrase any question in retired_questions. Use different question types and test a different angle of the concept where possible.',
      {
        concepts: concepts.map((c) => ({ ...c, facts: json(c.facts, []) })),
        retired_questions: retiredQuestions,
      },
    );
    const questions =
      ai?.data?.questions ??
      concepts.map((c) => ({
        concept_id: c.id,
        question_type: "short_answer",
        question_text: retiredQuestions.length
          ? `What are the main ideas and practical uses of ${c.title}?`
          : `Explain ${c.title}.`,
        options: null,
        correct_answer: c.definition,
        difficulty: 2,
      }));
    const runId = await this.aiRun(
      userId,
      "question_generation",
      ai?.model ?? "deterministic-local-v1",
      ai ? "question-generation-v1" : "fallback-question-generation-v1",
      { module_id: moduleId },
      { question_count: questions.length },
    );
    const created: string[] = [];
    const updated: string[] = [];
    const candidateHashes = new Set<string>();
    for (const question of questions) {
      if (
        !concepts.some((concept) => concept.id === question.concept_id) ||
        !question.question_text ||
        !question.correct_answer
      )
        continue;
      const contentHash = hash(question);
      candidateHashes.add(contentHash);
      const existing = await this.db.query<any>(
        "SELECT * FROM questions WHERE module_id=? AND content_hash=?",
        [moduleId, contentHash],
      );
      if (existing[0]) {
        if (existing[0].status === "generated") {
          const versionRows = await this.db.query<any>(
            "SELECT MAX(version) AS version FROM question_versions WHERE question_id=?",
            [existing[0].id],
          );
          const version = Number(versionRows[0].version ?? 0) + 1;
          await this.db.query(
            "UPDATE questions SET question_text=?,options=?,correct_answer=?,difficulty=?,ai_run_id=? WHERE id=?",
            [
              question.question_text,
              stringJson(question.options),
              question.correct_answer,
              question.difficulty ?? 3,
              runId,
              existing[0].id,
            ],
          );
          await this.db.query(
            "INSERT INTO question_versions (id,question_id,version,question_type,question_text,options,correct_answer,difficulty) VALUES (?,?,?,?,?,?,?,?)",
            [
              await this.db.id(),
              existing[0].id,
              version,
              question.question_type,
              question.question_text,
              stringJson(question.options),
              question.correct_answer,
              question.difficulty ?? 3,
            ],
          );
          updated.push(existing[0].id);
        }
        continue;
      }
      const id = await this.db.id();
      const versionId = await this.db.id();
      await this.db.query(
        "INSERT INTO questions (id,module_id,concept_id,ai_run_id,question_type,question_text,options,correct_answer,content_hash,difficulty,status) VALUES (?,?,?,?,?,?,?,?,?,?,'generated')",
        [
          id,
          moduleId,
          question.concept_id,
          runId,
          question.question_type,
          question.question_text,
          stringJson(question.options),
          question.correct_answer,
          contentHash,
          question.difficulty ?? 3,
        ],
      );
      await this.db.query(
        "INSERT INTO question_versions (id,question_id,version,question_type,question_text,options,correct_answer,difficulty) VALUES (?,?,1,?,?,?,?,?)",
        [
          versionId,
          id,
          question.question_type,
          question.question_text,
          stringJson(question.options),
          question.correct_answer,
          question.difficulty ?? 3,
        ],
      );
      created.push(id);
    }
    const existingGenerated = await this.db.query<any>(
      "SELECT id,content_hash FROM questions WHERE module_id=? AND status='generated'",
      [moduleId],
    );
    const retired = existingGenerated
      .filter((q) => !candidateHashes.has(q.content_hash))
      .map((q) => q.id);
    if (retired.length)
      await this.db.query(
        `UPDATE questions SET status='retired' WHERE id IN (${retired.map(() => "?").join(",")})`,
        retired,
      );
    if (!created.length && !updated.length)
      throw new BadRequestException(
        "No new question suggestions were created. Generate again to request different questions.",
      );
    const summary = {
      created,
      updated,
      preserved: [],
      retired,
      ai_run_id: runId,
    };
    await this.audit(
      userId,
      "module",
      moduleId,
      "questions_regenerated",
      summary,
    );
    return { message: "Questions regenerated successfully", ...summary };
  }
  async reviewQuestion(userId: string, id: string, body: any) {
    const rows = await this.db.query<any>(
      "SELECT q.* FROM questions q JOIN modules m ON m.id=q.module_id JOIN subjects s ON s.id=m.subject_id JOIN workspaces w ON w.id=s.workspace_id WHERE q.id=? AND w.user_id=?",
      [id, userId],
    );
    const question = rows[0];
    if (!question) throw new NotFoundException("Question not found");
    if (body.action === "edit") {
      const after = {
        question_text: body.question_text ?? question.question_text,
        options: body.options ?? question.options,
        correct_answer: body.correct_answer ?? question.correct_answer,
        difficulty: body.difficulty ?? question.difficulty,
        status: "edited",
      };
      const versions = await this.db.query<any>(
        "SELECT MAX(version) AS version FROM question_versions WHERE question_id=?",
        [id],
      );
      const version = Number(versions[0].version ?? 0) + 1;
      await this.db.query(
        "UPDATE questions SET question_text=?,options=?,correct_answer=?,difficulty=?,status=? WHERE id=?",
        [
          after.question_text,
          stringJson(after.options),
          after.correct_answer,
          after.difficulty,
          after.status,
          id,
        ],
      );
      await this.db.query(
        "INSERT INTO question_versions (id,question_id,version,question_type,question_text,options,correct_answer,difficulty) VALUES (?,?,?,?,?,?,?,?)",
        [
          await this.db.id(),
          id,
          version,
          question.question_type,
          after.question_text,
          stringJson(after.options),
          after.correct_answer,
          after.difficulty,
        ],
      );
      await this.audit(userId, "question", id, "edited", after, question);
      return { message: "Question edited successfully" };
    }
    const status =
      body.action === "approve"
        ? "approved"
        : body.action === "retire"
          ? "retired"
          : null;
    if (!status) throw new BadRequestException("Invalid question action");
    await this.db.query("UPDATE questions SET status=? WHERE id=?", [
      status,
      id,
    ]);
    await this.audit(
      userId,
      "question",
      id,
      body.action,
      { ...question, status },
      question,
    );
    return { message: `Question ${status} successfully` };
  }
  async startSession(userId: string, body: any) {
    const {
      module_id,
      question_count = 10,
      question_types = ["mcq", "true_false", "short_answer"],
      focus_mode = false,
    } = body;
    if (!(await this.ownsModule(module_id, userId)))
      throw new NotFoundException("Module not found");
    const types =
      Array.isArray(question_types) && question_types.length
        ? question_types
        : ["mcq", "true_false", "short_answer"];
    const count = Math.max(1, Math.min(50, Number(question_count) || 10));
    const questions = await this.db.query<any>(
      `SELECT q.*,c.title AS concept_title,(SELECT id FROM question_versions WHERE question_id=q.id ORDER BY version DESC LIMIT 1) AS question_version_id,previous.last_seen FROM questions q JOIN concepts c ON c.id=q.concept_id LEFT JOIN mastery m ON m.concept_id=c.id AND m.user_id=? LEFT JOIN (SELECT ssq.question_id,MAX(ss.started_at) AS last_seen FROM study_session_questions ssq JOIN study_sessions ss ON ss.id=ssq.study_session_id WHERE ss.user_id=? GROUP BY ssq.question_id) previous ON previous.question_id=q.id WHERE q.module_id=? AND q.status IN ('approved','edited') AND c.status IN ('accepted','edited','merged') AND c.is_outdated=FALSE AND q.question_type IN (${types.map(() => "?").join(",")}) ORDER BY CASE WHEN previous.question_id IS NULL THEN 0 ELSE 1 END,${focus_mode ? "COALESCE(m.score,0)," : ""} previous.last_seen ASC, RAND() LIMIT ${count}`,
      [userId, userId, module_id, ...types],
    );
    if (!questions.length)
      throw new BadRequestException("No approved questions available");
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO study_sessions (id,user_id,module_id,question_count,question_types,focus_mode) VALUES (?,?,?,?,?,?)",
      [
        id,
        userId,
        module_id,
        questions.length,
        JSON.stringify(types),
        Boolean(focus_mode),
      ],
    );
    for (const [index, q] of questions.entries())
      await this.db.query(
        "INSERT INTO study_session_questions (id,study_session_id,question_id,question_version_id,display_order) VALUES (?,?,?,?,?)",
        [await this.db.id(), id, q.id, q.question_version_id, index + 1],
      );
    const safe = questions.map(({ correct_answer, ...question }) => question);
    await this.audit(userId, "study_session", id, "started", {
      module_id,
      question_count: questions.length,
    });
    return {
      study_session: { id, module_id, question_count: questions.length },
      questions: safe,
    };
  }
  async createAttempt(userId: string, body: any) {
    const session = await this.db.query<any>(
      "SELECT * FROM study_sessions WHERE id=? AND user_id=? AND ended_at IS NULL",
      [body.study_session_id, userId],
    );
    if (!session[0]) throw new NotFoundException("Study session not found");
    const selected = await this.db.query<any>(
      "SELECT id FROM study_session_questions WHERE study_session_id=? AND question_id=? AND question_version_id=?",
      [body.study_session_id, body.question_id, body.question_version_id],
    );
    if (!selected.length)
      throw new BadRequestException("Question is not part of this session");
    const id = await this.db.id();
    await this.db.query(
      "INSERT INTO attempts (id,study_session_id,question_id,question_version_id,user_answer) VALUES (?,?,?,?,?)",
      [
        id,
        body.study_session_id,
        body.question_id,
        body.question_version_id,
        body.user_answer,
      ],
    );
    await this.audit(userId, "attempt", id, "created", {});
    return { attempt: { id } };
  }
  private async mastery(userId: string, conceptId: string) {
    const attempts = await this.db.query<any>(
      "SELECT a.result,a.created_at FROM attempts a JOIN questions q ON q.id=a.question_id JOIN study_sessions ss ON ss.id=a.study_session_id WHERE ss.user_id=? AND q.concept_id=? AND a.result IS NOT NULL",
      [userId, conceptId],
    );
    const points: any = { correct: 10, partial: 5, incorrect: -8 };
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          attempts.reduce(
            (sum, a) =>
              sum +
              points[a.result] *
                Math.max(
                  0.25,
                  1 -
                    (Date.now() - new Date(a.created_at).getTime()) /
                      2592000000,
                ),
            0,
          ),
        ),
      ),
    );
    const bucket =
      score < 25
        ? "New"
        : score < 50
          ? "Learning"
          : score < 75
            ? "Proficient"
            : "Mastered";
    const days =
      bucket === "New"
        ? 1
        : bucket === "Learning"
          ? 2
          : bucket === "Proficient"
            ? 4
            : 7;
    const next = new Date(Date.now() + days * 86400000);
    await this.db.query(
      "INSERT INTO mastery (id,user_id,concept_id,score,last_reviewed_at,next_review_at,calculation_metadata) VALUES (?,?,?,?,NOW(),?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),last_reviewed_at=VALUES(last_reviewed_at),next_review_at=VALUES(next_review_at)",
      [
        await this.db.id(),
        userId,
        conceptId,
        score,
        next,
        JSON.stringify({ bucket, attempt_count: attempts.length }),
      ],
    );
    return { score, bucket, next_review_at: next };
  }
  async gradeAttempt(userId: string, id: string) {
    const attempts = await this.db.query<any>(
      "SELECT a.*,q.concept_id,q.question_type,q.question_text,q.correct_answer FROM attempts a JOIN study_sessions ss ON ss.id=a.study_session_id JOIN questions q ON q.id=a.question_id WHERE a.id=? AND ss.user_id=?",
      [id, userId],
    );
    const attempt = attempts[0];
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.overridden)
      throw new BadRequestException(
        "This attempt has a user override and cannot be re-graded",
      );
    const answer = String(attempt.user_answer ?? "")
      .trim()
      .toLowerCase();
    const expected = String(attempt.correct_answer ?? "")
      .trim()
      .toLowerCase();
    let result: string;
    let confidence: number;
    let reason: string;
    if (
      attempt.question_type === "mcq" ||
      attempt.question_type === "true_false"
    ) {
      result = answer === expected ? "correct" : "incorrect";
      confidence = 100;
      reason = "Deterministic comparison with the stored expected answer.";
    } else {
      const expectedTokens = new Set(
        expected.match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? [],
      );
      const answerTokens = new Set(
        answer.match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? [],
      );
      const matched = [...expectedTokens].filter((word) =>
        answerTokens.has(word),
      ).length;
      const overlap = expectedTokens.size ? matched / expectedTokens.size : 0;
      result =
        overlap >= 0.7 ? "correct" : overlap >= 0.3 ? "partial" : "incorrect";
      confidence = Math.round(50 + overlap * 45);
      reason = `Matched ${matched} of ${expectedTokens.size} expected key terms.`;
    }
    await this.db.query(
      "UPDATE attempts SET result=?,confidence=?,grading_reason=? WHERE id=?",
      [result, confidence, reason, id],
    );
    await this.db.query(
      "UPDATE study_sessions SET score=COALESCE((SELECT SUM(CASE result WHEN 'correct' THEN 10 WHEN 'partial' THEN 5 ELSE 0 END) FROM attempts WHERE study_session_id=?),0) WHERE id=?",
      [attempt.study_session_id, attempt.study_session_id],
    );
    const mastery = await this.mastery(userId, attempt.concept_id);
    await this.audit(
      userId,
      "attempt",
      id,
      "graded",
      { result, confidence, grading_reason: reason, mastery },
      { result: attempt.result },
    );
    await this.audit(
      userId,
      "mastery",
      attempt.concept_id,
      "recalculated",
      mastery,
    );
    return {
      message: "Attempt graded successfully",
      attempt: { id, result, confidence, grading_reason: reason },
      mastery,
    };
  }
  async override(userId: string, id: string, body: any) {
    if (!["correct", "partial", "incorrect"].includes(body.result))
      throw new BadRequestException("Invalid result");
    const attempts = await this.db.query<any>(
      "SELECT a.*,q.concept_id FROM attempts a JOIN study_sessions ss ON ss.id=a.study_session_id JOIN questions q ON q.id=a.question_id WHERE a.id=? AND ss.user_id=?",
      [id, userId],
    );
    const attempt = attempts[0];
    if (!attempt) throw new NotFoundException("Attempt not found");
    await this.db.query(
      "UPDATE attempts SET result=?,overridden=TRUE,override_reason=? WHERE id=?",
      [body.result, body.override_reason ?? null, id],
    );
    await this.db.query(
      "UPDATE study_sessions SET score=COALESCE((SELECT SUM(CASE result WHEN 'correct' THEN 10 WHEN 'partial' THEN 5 ELSE 0 END) FROM attempts WHERE study_session_id=?),0) WHERE id=?",
      [attempt.study_session_id, attempt.study_session_id],
    );
    const mastery = await this.mastery(userId, attempt.concept_id);
    await this.audit(
      userId,
      "attempt",
      id,
      "grade_overridden",
      {
        result: body.result,
        override_reason: body.override_reason ?? null,
        mastery,
      },
      { result: attempt.result },
    );
    return {
      message: "Attempt grade overridden successfully",
      attempt: {
        id,
        result: body.result,
        overridden: true,
        override_reason: body.override_reason ?? null,
      },
      mastery,
    };
  }
  async endSession(userId: string, id: string) {
    const rows = await this.db.query<any>(
      "SELECT * FROM study_sessions WHERE id=? AND user_id=?",
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException("Study session not found");
    await this.db.query(
      "UPDATE study_sessions SET ended_at=COALESCE(ended_at,NOW()) WHERE id=?",
      [id],
    );
    await this.audit(userId, "study_session", id, "ended", {});
    return { message: "Study session ended successfully" };
  }
  async sources(moduleId: string, userId: string) {
    if (!(await this.ownsModule(moduleId, userId)))
      throw new NotFoundException("Module not found");
    return this.db.query<any>(
      "SELECT src.id,src.module_id,src.title,src.source_type,src.current_version,src.status,CASE WHEN src.source_type='pdf' THEN NULL ELSE sv.raw_text END AS raw_text FROM sources src JOIN source_versions sv ON sv.source_id=src.id AND sv.version=src.current_version WHERE src.module_id=? ORDER BY src.updated_at DESC",
      [moduleId],
    );
  }
  async sourceVersions(userId: string, id: string) {
    const source = await this.source(id, userId);
    if (!source) throw new NotFoundException("Source not found");
    return this.db.query<any>(
      "SELECT id,version,CASE WHEN ?='pdf' THEN NULL ELSE raw_text END AS raw_text,created_at FROM source_versions WHERE source_id=? ORDER BY version DESC",
      [source.source_type, id],
    );
  }
  async concepts(moduleId: string, userId: string) {
    if (!(await this.ownsModule(moduleId, userId)))
      throw new NotFoundException("Module not found");
    return this.db.query<any>(
      "SELECT c.id,c.module_id,c.source_version_id,c.merged_into_concept_id,c.title,c.definition,c.facts,c.tags,c.status,c.is_outdated,c.created_at,c.updated_at,m.score AS mastery_score FROM concepts c LEFT JOIN mastery m ON m.concept_id=c.id AND m.user_id=? WHERE c.module_id=? ORDER BY c.updated_at DESC",
      [userId, moduleId],
    );
  }
  async conceptVersions(userId: string, id: string) {
    const concept = await this.concept(id, userId);
    if (!concept) throw new NotFoundException("Concept not found");
    const edits = await this.db.query<any>(
      "SELECT old_value,created_at FROM audit_logs WHERE entity_type='concept' AND entity_id=? AND action='edit' ORDER BY created_at",
      [id],
    );
    const versions = edits.map((row, i) => ({
      version: i + 1,
      ...json(row.old_value, {}),
      created_at: row.created_at,
    }));
    versions.push({
      version: edits.length + 1,
      title: concept.title,
      definition: concept.definition,
      created_at: concept.updated_at,
    });
    return { current_version: versions.length, versions: versions.reverse() };
  }
  async questions(moduleId: string, userId: string) {
    if (!(await this.ownsModule(moduleId, userId)))
      throw new NotFoundException("Module not found");
    return this.db.query<any>(
      "SELECT q.id,q.question_text,q.question_type,q.difficulty,q.status,c.title AS concept_title,(SELECT MAX(version) FROM question_versions WHERE question_id=q.id) AS current_version FROM questions q JOIN concepts c ON c.id=q.concept_id WHERE q.module_id=? ORDER BY q.updated_at DESC",
      [moduleId],
    );
  }
  async questionVersions(userId: string, id: string) {
    const rows = await this.db.query<any>(
      "SELECT q.id FROM questions q JOIN modules m ON m.id=q.module_id JOIN subjects s ON s.id=m.subject_id JOIN workspaces w ON w.id=s.workspace_id WHERE q.id=? AND w.user_id=?",
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException("Question not found");
    const versions = await this.db.query<any>(
      "SELECT id,version,question_text,question_type,options,correct_answer,difficulty,created_at FROM question_versions WHERE question_id=? ORDER BY version DESC",
      [id],
    );
    return { current_version: versions[0]?.version ?? 1, versions };
  }
  async insights(moduleId: string, userId: string) {
    const rows = await this.db.query<any>(
      "SELECT SUM(CASE WHEN COALESCE(m.score,0)<25 THEN 1 ELSE 0 END) new_count,SUM(CASE WHEN COALESCE(m.score,0) BETWEEN 25 AND 49 THEN 1 ELSE 0 END) learning_count,SUM(CASE WHEN COALESCE(m.score,0) BETWEEN 50 AND 74 THEN 1 ELSE 0 END) proficient_count,SUM(CASE WHEN COALESCE(m.score,0)>=75 THEN 1 ELSE 0 END) mastered_count FROM concepts c LEFT JOIN mastery m ON m.concept_id=c.id AND m.user_id=? WHERE c.module_id=? AND c.status IN ('accepted','edited','merged')",
      [userId, moduleId],
    );
    const weak = await this.db.query<any>(
      "SELECT c.id,c.title,COALESCE(m.score,0) mastery_score FROM concepts c LEFT JOIN mastery m ON m.concept_id=c.id AND m.user_id=? WHERE c.module_id=? AND c.status IN ('accepted','edited','merged') ORDER BY mastery_score LIMIT 5",
      [userId, moduleId],
    );
    return { mastery_distribution: rows[0], weak_concepts: weak };
  }
  async homeInsights(userId: string) {
    const totals = await this.db.query<any>(
      `SELECT COUNT(DISTINCT ss.id) AS session_count, COUNT(a.id) AS attempt_count,
        SUM(CASE WHEN a.result='correct' THEN 1 ELSE 0 END) AS correct_count,
        SUM(CASE WHEN a.result='incorrect' THEN 1 ELSE 0 END) AS incorrect_count,
        SUM(CASE WHEN a.result='partial' THEN 1 ELSE 0 END) AS partial_count
       FROM study_sessions ss
       LEFT JOIN attempts a ON a.study_session_id=ss.id
       WHERE ss.user_id=?`,
      [userId],
    );
    const difficulties = await this.db.query<any>(
      `SELECT q.difficulty AS level, COUNT(*) AS correct_count
       FROM attempts a
       JOIN study_sessions ss ON ss.id=a.study_session_id
       JOIN questions q ON q.id=a.question_id
       WHERE ss.user_id=? AND a.result='correct'
       GROUP BY q.difficulty`,
      [userId],
    );
    const sessionsByDay = await this.db.query<any>(
      `SELECT DATE_FORMAT(started_at, '%Y-%m-%d') AS date, COUNT(*) AS sessions
       FROM study_sessions
       WHERE user_id=? AND started_at >= DATE_SUB(CURDATE(), INTERVAL 364 DAY)
       GROUP BY DATE_FORMAT(started_at, '%Y-%m-%d')`,
      [userId],
    );
    const correctByDay = await this.db.query<any>(
      `SELECT DATE_FORMAT(a.created_at, '%Y-%m-%d') AS date, COUNT(*) AS correct_answers
       FROM attempts a
       JOIN study_sessions ss ON ss.id=a.study_session_id
       WHERE ss.user_id=? AND a.result='correct'
         AND a.created_at >= DATE_SUB(CURDATE(), INTERVAL 364 DAY)
       GROUP BY DATE_FORMAT(a.created_at, '%Y-%m-%d')`,
      [userId],
    );

    const activity = new Map<string, { date: string; sessions: number; correct_answers: number }>();
    for (const row of sessionsByDay) {
      const date = dayKey(row.date);
      activity.set(date, {
        date,
        sessions: Number(row.sessions),
        correct_answers: 0,
      });
    }
    for (const row of correctByDay) {
      const date = dayKey(row.date);
      const day = activity.get(date) ?? { date, sessions: 0, correct_answers: 0 };
      day.correct_answers = Number(row.correct_answers);
      activity.set(date, day);
    }

    const difficultyCounts = {
      level_1: 0,
      level_2: 0,
      level_3: 0,
      level_4: 0,
      level_5: 0,
    };
    for (const row of difficulties)
      difficultyCounts[`level_${row.level}` as keyof typeof difficultyCounts] = Number(
        row.correct_count,
      );

    return {
      has_activity:
        Number(totals[0]?.session_count ?? 0) > 0 && Number(totals[0]?.attempt_count ?? 0) > 0,
      total_sessions: Number(totals[0]?.session_count ?? 0),
      total_correct: Number(totals[0]?.correct_count ?? 0),
      attempt_counts: {
        correct: Number(totals[0]?.correct_count ?? 0),
        incorrect: Number(totals[0]?.incorrect_count ?? 0),
        partial: Number(totals[0]?.partial_count ?? 0),
      },
      difficulty_counts: difficultyCounts,
      activity: [...activity.values()],
    };
  }
  async auditLogs(moduleId: string, userId: string) {
    if (!(await this.ownsModule(moduleId, userId)))
      throw new NotFoundException("Module not found");
    return this.db.query<any>(
      `SELECT al.id,al.entity_type,al.entity_id,al.action,al.old_value,al.new_value,al.created_at FROM audit_logs al WHERE al.user_id=? AND (al.entity_id=? OR EXISTS (SELECT 1 FROM sources s WHERE s.id=al.entity_id AND s.module_id=?) OR EXISTS (SELECT 1 FROM concepts c WHERE c.id=al.entity_id AND c.module_id=?) OR EXISTS (SELECT 1 FROM questions q WHERE q.id=al.entity_id AND q.module_id=?) OR EXISTS (SELECT 1 FROM study_sessions ss WHERE ss.id=al.entity_id AND ss.module_id=?) OR EXISTS (SELECT 1 FROM attempts a JOIN study_sessions ss ON ss.id=a.study_session_id WHERE a.id=al.entity_id AND ss.module_id=?)) ORDER BY al.created_at DESC`,
      [userId, moduleId, moduleId, moduleId, moduleId, moduleId, moduleId],
    );
  }
}
