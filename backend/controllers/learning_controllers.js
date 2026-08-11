import { createHash } from 'node:crypto';
import executeQuery from '../services/db/runQuery.js';
import {
    extractConceptsWithAi,
    generateQuestionsWithAi,
    mergeConceptsWithAi,
    gradeShortAnswerWithAi
} from '../services/ai_service.js';

const jsonValue = (value) => {
    if (value === undefined || value === null) return null;

    if (typeof value === 'string') {
        JSON.parse(value);
        return value;
    }

    return JSON.stringify(value);
};

const newId = async () => {
    const rows = await executeQuery('SELECT UUID() AS id');
    return rows[0].id;
};

const writeAuditLog = async (userId, entityType, entityId, action, newValue, oldValue = null) => {
    await executeQuery(
        `INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_value, new_value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            userId,
            entityType,
            entityId,
            action,
            oldValue === null ? null : JSON.stringify(oldValue),
            JSON.stringify(newValue)
        ]
    );
};

const userOwnsModule = async (moduleId, userId) => {
    const rows = await executeQuery(
        `SELECT m.id
         FROM modules m
         JOIN subjects s ON s.id = m.subject_id
         JOIN workspaces w ON w.id = s.workspace_id
         WHERE m.id = ? AND w.user_id = ?`,
        [moduleId, userId]
    );

    return rows.length > 0;
};

const userOwnsSource = async (sourceId, userId) => {
    const rows = await executeQuery(
        `SELECT s.id, s.current_version
         FROM sources s
         JOIN modules m ON m.id = s.module_id
         JOIN subjects sub ON sub.id = m.subject_id
         JOIN workspaces w ON w.id = sub.workspace_id
         WHERE s.id = ? AND w.user_id = ?`,
        [sourceId, userId]
    );

    return rows[0] ?? null;
};

const userOwnsAiRun = async (aiRunId, userId, runType = null) => {
    if (!aiRunId) return true;
    const rows = await executeQuery(
        `SELECT id FROM ai_runs WHERE id = ? AND user_id = ?${runType ? ' AND run_type = ?' : ''}`,
        runType ? [aiRunId, userId, runType] : [aiRunId, userId]
    );
    return rows.length > 0;
};

const userOwnsConcept = async (conceptId, userId) => {
    const rows = await executeQuery(
        `SELECT c.id, c.module_id, c.status
         FROM concepts c
         JOIN modules m ON m.id = c.module_id
         JOIN subjects s ON s.id = m.subject_id
         JOIN workspaces w ON w.id = s.workspace_id
         WHERE c.id = ? AND w.user_id = ?`,
        [conceptId, userId]
    );

    return rows[0] ?? null;
};

const parseJson = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    return typeof value === 'string' ? JSON.parse(value) : value;
};

const cleanConceptText = (value) => (value ?? '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanConceptTitle = (value) => cleanConceptText(value)
    .replace(/^(deep dive|overview|introduction|topic)\s*[:\-]\s*/i, '')
    .trim();

const comparableText = (value) => cleanConceptText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const meaningfulDefinition = (candidate) => {
    const title = cleanConceptTitle(candidate.title);
    const definition = cleanConceptText(candidate.definition);
    const definitionIsHeading = comparableText(definition) === comparableText(title) ||
        (definition.length < 50 && comparableText(definition).includes(comparableText(title)));

    if (!definitionIsHeading && definition.split(/\s+/).length >= 8) return definition;

    const facts = (candidate.facts ?? [])
        .map(cleanConceptText)
        .filter((fact) => fact.length > 20 && comparableText(fact) !== comparableText(title));
    if (facts.length) return facts.slice(0, 2).join(' ');

    const excerpt = cleanConceptText(candidate.source_excerpt);
    const sentences = excerpt.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    const explanation = sentences
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 30 && comparableText(sentence) !== comparableText(title))
        .slice(0, 2)
        .join(' ');
    return explanation || `This concept explains the key ideas and practical use of ${title}.`;
};

const questionHash = ({ concept_id, question_type, question_text, correct_answer }) => createHash('sha256')
    .update(JSON.stringify({
        concept_id,
        question_type,
        question_text: question_text.trim().toLowerCase(),
        correct_answer: correct_answer.trim().toLowerCase()
    }))
    .digest('hex');

const userOwnsStudySession = async (studySessionId, userId) => {
    const rows = await executeQuery(
        'SELECT id, module_id, ended_at FROM study_sessions WHERE id = ? AND user_id = ?',
        [studySessionId, userId]
    );

    return rows[0] ?? null;
};

const userOwnsAttempt = async (attemptId, userId) => {
    const rows = await executeQuery(
        `SELECT a.id, a.question_id, q.concept_id, a.result, a.confidence, a.grading_reason, a.overridden,
                a.override_reason, a.created_at, q.question_type, q.question_text,
                q.correct_answer, ss.id AS study_session_id
         FROM attempts a
         JOIN study_sessions ss ON ss.id = a.study_session_id
         JOIN questions q ON q.id = a.question_id
         WHERE a.id = ? AND ss.user_id = ?`,
        [attemptId, userId]
    );

    return rows[0] ?? null;
};

const resultPoints = { correct: 10, partial: 5, incorrect: -8 };

const answerTokens = (text) => new Set(
    (text ?? '').toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? []
);

const masteryBucket = (score) => {
    if (score < 25) return { label: 'New', reviewDays: 1 };
    if (score < 50) return { label: 'Learning', reviewDays: 2 };
    if (score < 75) return { label: 'Proficient', reviewDays: 4 };
    return { label: 'Mastered', reviewDays: 7 };
};

// Rebuilding from the immutable attempt history makes an override safe and repeatable.
// Attempts lose weight linearly over 30 days, down to a 25% minimum weight.
const recalculateMastery = async (userId, conceptId) => {
    const previousRows = await executeQuery(
        'SELECT score, last_reviewed_at, next_review_at, calculation_metadata FROM mastery WHERE user_id = ? AND concept_id = ?',
        [userId, conceptId]
    );
    const previous = previousRows[0] ?? null;
    const rows = await executeQuery(
        `SELECT a.result, a.created_at
         FROM attempts a
         JOIN study_sessions ss ON ss.id = a.study_session_id
         JOIN questions q ON q.id = a.question_id
         WHERE ss.user_id = ? AND q.concept_id = ? AND a.result IS NOT NULL
         ORDER BY a.created_at ASC`,
        [userId, conceptId]
    );

    const now = new Date();
    const weightedPoints = rows.reduce((total, attempt) => {
        const ageDays = Math.max(0, (now - new Date(attempt.created_at)) / 86_400_000);
        const recencyWeight = Math.max(0.25, 1 - ageDays / 30);
        return total + resultPoints[attempt.result] * recencyWeight;
    }, 0);
    const score = Math.max(0, Math.min(100, Math.round(weightedPoints)));
    const lastAttempt = rows.at(-1) ?? null;
    const bucket = masteryBucket(score);
    const lastReviewedAt = lastAttempt ? new Date(lastAttempt.created_at) : null;
    const nextReviewAt = lastReviewedAt
        ? new Date(lastReviewedAt.getTime() + bucket.reviewDays * 86_400_000)
        : null;
    const metadata = {
        formula: 'sum(result_points × max(0.25, 1 - age_days/30)), clamped to 0-100',
        result_points: resultPoints,
        attempt_count: rows.length,
        bucket: bucket.label,
        last_result: lastAttempt?.result ?? null,
        review_interval_days: bucket.reviewDays
    };

    await executeQuery(
        `INSERT INTO mastery
            (id, user_id, concept_id, score, last_reviewed_at, next_review_at, calculation_metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            score = VALUES(score), last_reviewed_at = VALUES(last_reviewed_at),
            next_review_at = VALUES(next_review_at), calculation_metadata = VALUES(calculation_metadata)`,
        [await newId(), userId, conceptId, score, lastReviewedAt, nextReviewAt, JSON.stringify(metadata)]
    );

    return { score, bucket: bucket.label, next_review_at: nextReviewAt, metadata, previous };
};

const writeMasteryRecalculationAudit = async (userId, conceptId, mastery, reason) => {
    await writeAuditLog(userId, 'mastery', conceptId, 'recalculated', {
        reason,
        score: mastery.score,
        bucket: mastery.bucket,
        next_review_at: mastery.next_review_at,
        attempt_count: mastery.metadata.attempt_count
    }, mastery.previous);
};

const recalculateSessionScore = async (studySessionId) => {
    await executeQuery(
        `UPDATE study_sessions
         SET score = COALESCE((
             SELECT SUM(CASE result WHEN 'correct' THEN 10 WHEN 'partial' THEN 5 ELSE 0 END)
             FROM attempts WHERE study_session_id = ?
         ), 0)
         WHERE id = ?`,
        [studySessionId, studySessionId]
    );
};

const userOwnsQuestion = async (questionId, userId) => {
    const rows = await executeQuery(
        `SELECT q.id, q.module_id, q.concept_id, q.question_type, q.question_text,
                q.options, q.correct_answer, q.difficulty, q.status
         FROM questions q
         JOIN modules m ON m.id = q.module_id
         JOIN subjects s ON s.id = m.subject_id
         JOIN workspaces w ON w.id = s.workspace_id
         WHERE q.id = ? AND w.user_id = ?`,
        [questionId, userId]
    );

    return rows[0] ?? null;
};

export const createSource = async (req, res) => {
    try {
        const { module_id, title, source_type = 'paste', raw_text, file_data, source_url } = req.body;

        if (!module_id || !title || (!raw_text && !file_data && !source_url)) {
            return res.status(400).json({
                message: 'module_id, title, and source content are required'
            });
        }

        if (!['paste', 'pdf', 'image'].includes(source_type)) {
            return res.status(400).json({ message: 'Invalid source_type' });
        }

        if (!(await userOwnsModule(module_id, req.user.id))) {
            return res.status(403).json({ message: 'You do not have access to this module' });
        }

        let finalSourceType = source_type;
        let sourceContent = raw_text;
        if (file_data) {
            if (source_type !== 'pdf' || Buffer.byteLength(file_data, 'base64') > 8 * 1024 * 1024) {
                return res.status(400).json({ message: 'Only PDF files up to 8 MB are supported' });
            }
            sourceContent = file_data;
        }
        if (source_url) {
            let url;
            try { 
                url = new URL(source_url); 
            } catch { 
                return res.status(400).json({ message: 'Provide a valid public URL' }); 
            }
            if (!['http:', 'https:'].includes(url.protocol)) {
                return res.status(400).json({ message: 'Only http and https URLs are supported' });
            }
            const remote = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!remote.ok) return res.status(400).json({ message: 'Unable to download content from this URL' });
            const contentType = remote.headers.get('content-type') ?? '';
            const bytes = await remote.arrayBuffer();
            if (bytes.byteLength > 8 * 1024 * 1024) return res.status(400).json({ message: 'URL content must be 8 MB or smaller' });
            if (contentType.includes('application/pdf') || url.pathname.toLowerCase().endsWith('.pdf')) {
                finalSourceType = 'pdf';
                sourceContent = Buffer.from(bytes).toString('base64');
            } else {
                finalSourceType = 'paste';
                sourceContent = Buffer.from(bytes).toString('utf8')
                    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }
        }
        if (!sourceContent?.trim()) return res.status(400).json({ message: 'No readable content was found' });

        const sourceId = await newId();
        const sourceVersionId = await newId();

        await executeQuery(
            `INSERT INTO sources (id, module_id, title, source_type, current_version, status)
             VALUES (?, ?, ?, ?, 1, 'draft')`,
            [sourceId, module_id, title, finalSourceType]
        );

        await executeQuery(
            `INSERT INTO source_versions (id, source_id, version, raw_text)
             VALUES (?, ?, 1, ?)`,
            [sourceVersionId, sourceId, sourceContent]
        );

        await writeAuditLog(req.user.id, 'source', sourceId, 'created', {
            title,
            source_type: finalSourceType,
            version: 1
        });

        return res.status(201).json({
            message: 'Source created successfully',
            source: { id: sourceId, module_id, title, source_type: finalSourceType, current_version: 1 },
            source_version: { id: sourceVersionId, version: 1 }
        });
    } catch (error) {
        console.error('Error creating source:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createSourceVersion = async (req, res) => {
    try {
        const { source_id, raw_text } = req.body;

        if (!source_id || !raw_text) {
            return res.status(400).json({ message: 'source_id and raw_text are required' });
        }

        const source = await userOwnsSource(source_id, req.user.id);
        if (!source) {
            return res.status(403).json({ message: 'You do not have access to this source' });
        }

        const previousVersions = await executeQuery(
            `SELECT id, version, raw_text
             FROM source_versions
             WHERE source_id = ? AND version = ?`,
            [source_id, source.current_version]
        );
        const previousVersion = previousVersions[0] ?? null;
        const version = source.current_version + 1;
        const sourceVersionId = await newId();

        await executeQuery(
            `INSERT INTO source_versions (id, source_id, version, raw_text)
             VALUES (?, ?, ?, ?)`,
            [sourceVersionId, source_id, version, raw_text]
        );

        await executeQuery(
            `UPDATE sources
             SET current_version = ?, status = 'needs_review'
             WHERE id = ?`,
            [version, source_id]
        );

        await executeQuery(
            `UPDATE concepts c
             JOIN source_versions sv ON sv.id = c.source_version_id
             SET c.is_outdated = TRUE
             WHERE sv.source_id = ?`,
            [source_id]
        );

        await writeAuditLog(req.user.id, 'source', source_id, 'version_created', {
            version,
            source_version_id: sourceVersionId,
            raw_text,
            concepts_marked_outdated: true
        }, previousVersion ? {
            version: previousVersion.version,
            source_version_id: previousVersion.id,
            raw_text: previousVersion.raw_text
        } : { previous_version: source.current_version });

        return res.status(201).json({
            message: 'Source version created; existing concepts now need review',
            source_version: { id: sourceVersionId, source_id, version }
        });
    } catch (error) {
        console.error('Error creating source version:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const processSource = async (req, res) => {
    try {
        const { sourceId } = req.params;
        const source = await userOwnsSource(sourceId, req.user.id);
        if (!source) return res.status(404).json({ message: 'Source not found' });

        const versionRows = await executeQuery(
            `SELECT sv.id, sv.version, sv.raw_text, src.module_id, src.source_type
             FROM source_versions sv JOIN sources src ON src.id = sv.source_id
             WHERE sv.source_id = ? AND sv.version = ?`,
            [sourceId, source.current_version]
        );
        const sourceVersion = versionRows[0];
        const existingRows = await executeQuery(
            'SELECT id, title, status FROM concepts WHERE source_version_id = ?',
            [sourceVersion.id]
        );
        const existingConcepts = new Map(
            existingRows.map((row) => [cleanConceptTitle(row.title).toLowerCase(), row])
        );
        const blocks = sourceVersion.source_type === 'pdf' ? [] : sourceVersion.raw_text
            .split(/\r?\n\s*\r?\n|\r?\n/)
            .map((block) => block.replace(/\s+/g, ' ').trim())
            .filter((block) => !/^#{1,6}\s/.test(block))
            .filter((block) => block.length >= 20)
            .slice(0, 8);
        const mockCandidates = (blocks.length ? blocks : [sourceVersion.raw_text.trim()]).map((block) => {
            const sentences = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? [block];
            const title = sentences[0].replace(/[^\w\s-]/g, '').split(/\s+/).slice(0, 8).join(' ') || 'Untitled concept';
            return {
                title: title.charAt(0).toUpperCase() + title.slice(1),
                definition: sentences[0],
                facts: sentences.slice(0, 4),
                source_excerpt: block.slice(0, 1000)
            };
        });
        const aiResult = await extractConceptsWithAi({
            rawText: sourceVersion.source_type === 'pdf' ? null : sourceVersion.raw_text,
            pdfBase64: sourceVersion.source_type === 'pdf' ? sourceVersion.raw_text : null
        });
        const aiCandidates = aiResult?.data?.concepts?.filter((concept) =>
            typeof concept.title === 'string' && typeof concept.definition === 'string' &&
            Array.isArray(concept.facts) && typeof concept.source_excerpt === 'string'
        );
        if (sourceVersion.source_type === 'pdf' && !aiCandidates?.length) {
            return res.status(502).json({ message: 'AI could not process this PDF. Please try again.' });
        }
        const candidates = (aiCandidates?.length ? aiCandidates : mockCandidates).map((candidate) => ({
            ...candidate,
            title: cleanConceptTitle(candidate.title),
            definition: meaningfulDefinition(candidate),
            facts: (candidate.facts ?? []).map(cleanConceptText).filter(Boolean),
            source_excerpt: cleanConceptText(candidate.source_excerpt)
        })).filter((candidate) => candidate.title && candidate.definition);
        const model = aiResult?.model ?? 'deterministic-local-v1';
        const promptVersion = aiResult ? 'concept-extraction-v1' : 'mock-concept-extraction-v1';

        const aiRunId = await newId();
        await executeQuery(
            `INSERT INTO ai_runs (id, user_id, run_type, model, prompt_version, input_data, output_data)
             VALUES (?, ?, 'concept_extraction', ?, ?, ?, ?)`,
            [aiRunId, req.user.id, model, promptVersion,
                JSON.stringify({ source_id: sourceId, source_version: sourceVersion.version }),
                JSON.stringify({ concept_count: candidates.length, response_id: aiResult?.responseId ?? null,
                    strategy: aiResult ? 'Gemini extraction' : 'paragraph and sentence extraction' })]
        );

        const created = [];
        for (const candidate of candidates) {
            const existing = existingConcepts.get(candidate.title.toLowerCase());
            if (existing?.status === 'suggested') {
                await executeQuery(
                    `UPDATE concepts
                     SET title = ?, definition = ?, facts = ?, is_outdated = FALSE
                     WHERE id = ?`,
                    [candidate.title, candidate.definition, jsonValue(candidate.facts), existing.id]
                );
                continue;
            }
            if (existing) continue;
            const conceptId = await newId();
            await executeQuery(
                `INSERT INTO concepts
                    (id, module_id, source_version_id, source_excerpt, ai_run_id, title, definition, facts, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'suggested')`,
                [conceptId, sourceVersion.module_id, sourceVersion.id, candidate.source_excerpt, aiRunId,
                    candidate.title, candidate.definition, JSON.stringify(candidate.facts),]
            );
            created.push({ id: conceptId, title: candidate.title });
        }
        await executeQuery("UPDATE sources SET status = 'processed' WHERE id = ?", [sourceId]);
        await writeAuditLog(req.user.id, 'source', sourceId, 'processed', {
            source_version_id: sourceVersion.id, ai_run_id: aiRunId, created_concepts: created
        });

        return res.status(200).json({
            message: 'Source processed successfully', ai_run: { id: aiRunId }, created_concepts: created
        });
    } catch (error) {
        console.error('Error processing source:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createAiRun = async (req, res) => {
    try {
        const { run_type, model, prompt_version, input_data, output_data } = req.body;

        if (!run_type || !model || !prompt_version) {
            return res.status(400).json({
                message: 'run_type, model, and prompt_version are required'
            });
        }

        if (!['concept_extraction', 'question_generation', 'grading'].includes(run_type)) {
            return res.status(400).json({ message: 'Invalid run_type' });
        }

        const aiRunId = await newId();
        await executeQuery(
            `INSERT INTO ai_runs (id, user_id, run_type, model, prompt_version, input_data, output_data)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                aiRunId,
                req.user.id,
                run_type,
                model,
                prompt_version,
                jsonValue(input_data),
                jsonValue(output_data)
            ]
        );

        return res.status(201).json({
            message: 'AI run recorded successfully',
            ai_run: { id: aiRunId, run_type, model, prompt_version }
        });
    } catch (error) {
        console.error('Error creating AI run:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createConcept = async (req, res) => {
    try {
        const {
            module_id,
            source_version_id,
            ai_run_id = null,
            title,
            definition = null,
            facts = null,
            tags = null,
            source_excerpt = null
        } = req.body;

        if (!module_id || !source_version_id || !title) {
            return res.status(400).json({
                message: 'module_id, source_version_id, and title are required'
            });
        }

        if (!(await userOwnsModule(module_id, req.user.id))) {
            return res.status(403).json({ message: 'You do not have access to this module' });
        }

        const sourceVersion = await executeQuery(
            `SELECT sv.id
             FROM source_versions sv
             JOIN sources src ON src.id = sv.source_id
             WHERE sv.id = ? AND src.module_id = ?`,
            [source_version_id, module_id]
        );
        if (!sourceVersion.length) {
            return res.status(400).json({ message: 'source_version_id does not belong to this module' });
        }

        const conceptId = await newId();
        await executeQuery(
            `INSERT INTO concepts
                (id, module_id, source_version_id, ai_run_id, title, definition, facts, tags, source_excerpt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                conceptId,
                module_id,
                source_version_id,
                ai_run_id,
                title,
                definition,
                jsonValue(facts),
                jsonValue(tags),
                source_excerpt
            ]
        );
        await writeAuditLog(req.user.id, 'concept', conceptId, 'created', { title, status: 'suggested' });

        return res.status(201).json({
            message: 'Concept created successfully',
            concept: { id: conceptId, module_id, source_version_id, title, status: 'suggested' }
        });
    } catch (error) {
        console.error('Error creating concept:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const reviewConcept = async (req, res) => {
    try {
        const { conceptId } = req.params;
        const { action, title, definition, facts, tags } = req.body;

        if (!['accept', 'edit', 'reject'].includes(action)) {
            return res.status(400).json({
                message: 'action must be accept, edit, or reject'
            });
        }

        const concept = await userOwnsConcept(conceptId, req.user.id);
        if (!concept) {
            return res.status(404).json({ message: 'Concept not found' });
        }
        if (concept.status === 'merged') {
            return res.status(400).json({ message: 'A merged concept cannot be reviewed' });
        }

        const currentRows = await executeQuery(
            `SELECT title, definition, facts, tags, status, is_outdated
             FROM concepts
             WHERE id = ?`,
            [conceptId]
        );
        const current = currentRows[0];

        if (action === 'edit' &&
            title === undefined && definition === undefined && facts === undefined && tags === undefined) {
            return res.status(400).json({
                message: 'Provide at least one of title, definition, facts, or tags when editing a concept'
            });
        }

        const nextStatus = action === 'accept'
            ? 'accepted'
            : action === 'edit'
                ? 'edited'
                : 'rejected';

        const nextTitle = title === undefined ? current.title : title;
        const nextDefinition = definition === undefined ? current.definition : definition;
        const nextFacts = facts === undefined ? jsonValue(current.facts) : jsonValue(facts);
        const nextTags = tags === undefined ? jsonValue(current.tags) : jsonValue(tags);
        await executeQuery(
            `UPDATE concepts
             SET title = ?, definition = ?, facts = ?, tags = ?, status = ?, is_outdated = FALSE
             WHERE id = ?`,
            [nextTitle, nextDefinition, nextFacts, nextTags, nextStatus, conceptId]
        );

        const updated = {
            title: nextTitle,
            definition: nextDefinition,
            facts: facts === undefined ? current.facts : facts,
            tags: tags === undefined ? current.tags : tags,
            status: nextStatus,
            is_outdated: false
        };
        await writeAuditLog(req.user.id, 'concept', conceptId, action, updated, current);

        return res.status(200).json({
            message: `Concept ${nextStatus} successfully`,
            concept: { id: conceptId, ...updated }
        });
    } catch (error) {
        console.error('Error reviewing concept:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const mergeConcepts = async (req, res) => {
    try {
        const { conceptId } = req.params;
        const { target_concept_id } = req.body;
        if (!target_concept_id || target_concept_id === conceptId) {
            return res.status(400).json({ message: 'target_concept_id must identify a different concept' });
        }

        const source = await userOwnsConcept(conceptId, req.user.id);
        const target = await userOwnsConcept(target_concept_id, req.user.id);
        if (!source || !target) return res.status(404).json({ message: 'Concept not found' });
        if (source.module_id !== target.module_id) {
            return res.status(400).json({ message: 'Concepts can only be merged within the same module' });
        }
        if (source.status === 'rejected' || target.status === 'rejected') {
            return res.status(400).json({ message: 'Rejected concepts cannot be merged' });
        }

        const conceptRows = await executeQuery(
            `SELECT id, module_id, source_version_id, title, definition, facts, tags, status
             FROM concepts WHERE id IN (?, ?)`,
            [conceptId, target_concept_id]
        );
        const sourceData = conceptRows.find((concept) => concept.id === conceptId);
        const targetData = conceptRows.find((concept) => concept.id === target_concept_id);
        const aiResult = await mergeConceptsWithAi([
            { ...sourceData, facts: parseJson(sourceData.facts, []), tags: parseJson(sourceData.tags, []) },
            { ...targetData, facts: parseJson(targetData.facts, []), tags: parseJson(targetData.tags, []) }
        ]);
        const merged = aiResult.data;
        const mergedConceptId = await newId();
        const aiRunId = await newId();

        await executeQuery(
            `INSERT INTO ai_runs (id, user_id, run_type, model, prompt_version, input_data, output_data)
             VALUES (?, ?, 'concept_extraction', ?, 'concept-merge-v1', ?, ?)`,
            [
                aiRunId,
                req.user.id,
                aiResult.model,
                JSON.stringify({ concepts: [sourceData, targetData] }),
                JSON.stringify({ concept: merged, response_id: aiResult.responseId })
            ]
        );
        await executeQuery(
            `INSERT INTO concepts
                (id, module_id, source_version_id, source_excerpt, ai_run_id, title, definition, facts, tags, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'merged')`,
            [
                mergedConceptId,
                source.module_id,
                targetData.source_version_id,
                `Merged from: ${sourceData.title}; ${targetData.title}`,
                aiRunId,
                merged.title,
                merged.definition,
                jsonValue(merged.facts ?? []),
                jsonValue(merged.tags ?? [])
            ]
        );

        const movedRows = await executeQuery(
            `SELECT id FROM questions
             WHERE concept_id IN (?, ?) AND status IN ('generated', 'approved', 'edited')`,
            [conceptId, target_concept_id]
        );
        await executeQuery(
            `UPDATE questions SET concept_id = ?
             WHERE concept_id IN (?, ?) AND status IN ('generated', 'approved', 'edited')`,
            [mergedConceptId, conceptId, target_concept_id]
        );
        await executeQuery(
            `UPDATE concepts
             SET status = 'rejected', merged_into_concept_id = ?
             WHERE id IN (?, ?)`,
            [mergedConceptId, conceptId, target_concept_id]
        );
        const mastery = await recalculateMastery(req.user.id, mergedConceptId);
        await writeMasteryRecalculationAudit(req.user.id, mergedConceptId, mastery, 'concept_merge');
        await writeAuditLog(req.user.id, 'concept', mergedConceptId, 'merged', {
            merged_from_concept_ids: [conceptId, target_concept_id],
            moved_question_ids: movedRows.map((row) => row.id),
            mastery
        });
        await writeAuditLog(req.user.id, 'concept', conceptId, 'rejected_for_merge', {
            status: 'rejected', merged_into_concept_id: mergedConceptId
        }, sourceData);
        await writeAuditLog(req.user.id, 'concept', target_concept_id, 'rejected_for_merge', {
            status: 'rejected', merged_into_concept_id: mergedConceptId
        }, targetData);

        return res.status(200).json({
            message: 'Concepts merged successfully',
            merged_concept: {
                id: mergedConceptId,
                title: merged.title,
                definition: merged.definition,
                status: 'merged',
                is_outdated: false,
                merged_into_concept_id: null,
                mastery_score: mastery.score
            },
            moved_question_count: movedRows.length,
            mastery
        });
    } catch (error) {
        console.error('Error merging concepts:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createQuestion = async (req, res) => {
    try {
        const {
            module_id,
            concept_id,
            ai_run_id = null,
            question_type,
            question_text,
            options = null,
            correct_answer,
            difficulty = 3,
            status = 'generated'
        } = req.body;

        if (!module_id || !concept_id || !question_type || !question_text || !correct_answer) {
            return res.status(400).json({
                message: 'module_id, concept_id, question_type, question_text, and correct_answer are required'
            });
        }

        if (!['mcq', 'true_false', 'short_answer'].includes(question_type)) {
            return res.status(400).json({ message: 'Invalid question_type' });
        }
        if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
            return res.status(400).json({ message: 'difficulty must be an integer from 1 to 5' });
        }
        if (!['generated', 'approved', 'edited', 'retired'].includes(status)) {
            return res.status(400).json({ message: 'Invalid question status' });
        }

        const concept = await userOwnsConcept(concept_id, req.user.id);
        if (!concept || concept.module_id !== module_id) {
            return res.status(403).json({ message: 'This concept is not available in the selected module' });
        }

        const normalizedQuestion = JSON.stringify({
            concept_id,
            question_type,
            question_text: question_text.trim().toLowerCase(),
            correct_answer: correct_answer.trim().toLowerCase()
        });
        const contentHash = createHash('sha256').update(normalizedQuestion).digest('hex');

        const questionId = await newId();
        const questionVersionId = await newId();
        await executeQuery(
            `INSERT INTO questions
                (id, module_id, concept_id, ai_run_id, question_type, question_text, options,
                 correct_answer, content_hash, difficulty, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                questionId,
                module_id,
                concept_id,
                ai_run_id,
                question_type,
                question_text,
                jsonValue(options),
                correct_answer,
                contentHash,
                difficulty,
                status
            ]
        );

        await executeQuery(
            `INSERT INTO question_versions
                (id, question_id, version, question_type, question_text, options, correct_answer, difficulty)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
            [questionVersionId, questionId, question_type, question_text, jsonValue(options), correct_answer, difficulty]
        );

        await writeAuditLog(req.user.id, 'question', questionId, 'created', {
            question_type,
            status,
            version: 1
        });

        return res.status(201).json({
            message: 'Question created successfully',
            question: { id: questionId, module_id, concept_id, status },
            question_version: { id: questionVersionId, version: 1 }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'An identical question already exists in this module' });
        }
        console.error('Error creating question:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const reviewQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const { action, question_text, options, correct_answer, difficulty } = req.body;

        if (!['approve', 'edit', 'retire'].includes(action)) {
            return res.status(400).json({
                message: 'action must be approve, edit, or retire'
            });
        }

        const question = await userOwnsQuestion(questionId, req.user.id);
        if (!question) {
            return res.status(404).json({ message: 'Question not found' });
        }
        if (question.status === 'retired' && action !== 'approve') {
            return res.status(400).json({ message: 'A retired question cannot be edited or retired again' });
        }

        if (action === 'edit' &&
            question_text === undefined && options === undefined &&
            correct_answer === undefined && difficulty === undefined) {
            return res.status(400).json({
                message: 'Provide question_text, options, correct_answer, or difficulty when editing a question'
            });
        }
        if (difficulty !== undefined &&
            (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5)) {
            return res.status(400).json({ message: 'difficulty must be an integer from 1 to 5' });
        }

        const oldValue = {
            question_text: question.question_text,
            options: question.options,
            correct_answer: question.correct_answer,
            difficulty: question.difficulty,
            status: question.status
        };

        if (action === 'edit') {
            const nextQuestionText = question_text === undefined ? question.question_text : question_text;
            const nextOptions = options === undefined ? jsonValue(question.options) : jsonValue(options);
            const nextCorrectAnswer = correct_answer === undefined ? question.correct_answer : correct_answer;
            const nextDifficulty = difficulty === undefined ? question.difficulty : difficulty;
            const normalizedQuestion = JSON.stringify({
                concept_id: question.concept_id,
                question_type: question.question_type,
                question_text: nextQuestionText.trim().toLowerCase(),
                correct_answer: nextCorrectAnswer.trim().toLowerCase()
            });
            const contentHash = createHash('sha256').update(normalizedQuestion).digest('hex');

            const versionRows = await executeQuery(
                'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM question_versions WHERE question_id = ?',
                [questionId]
            );
            const nextVersion = versionRows[0].next_version;
            const questionVersionId = await newId();

            await executeQuery(
                `UPDATE questions
                 SET question_text = ?, options = ?, correct_answer = ?, difficulty = ?,
                     content_hash = ?, status = 'edited'
                 WHERE id = ?`,
                [
                    nextQuestionText,
                    nextOptions,
                    nextCorrectAnswer,
                    nextDifficulty,
                    contentHash,
                    questionId
                ]
            );

            await executeQuery(
                `INSERT INTO question_versions
                    (id, question_id, version, question_type, question_text, options, correct_answer, difficulty)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    questionVersionId,
                    questionId,
                    nextVersion,
                    question.question_type,
                    nextQuestionText,
                    nextOptions,
                    nextCorrectAnswer,
                    nextDifficulty
                ]
            );

            const updated = {
                question_text: nextQuestionText,
                options: options === undefined ? question.options : options,
                correct_answer: nextCorrectAnswer,
                difficulty: nextDifficulty,
                status: 'edited'
            };
            await writeAuditLog(req.user.id, 'question', questionId, 'edited', updated, oldValue);

            return res.status(200).json({
                message: 'Question edited successfully',
                question: { id: questionId, ...updated },
                question_version: { id: questionVersionId, version: nextVersion }
            });
        }

        const nextStatus = action === 'approve' ? 'approved' : 'retired';
        await executeQuery('UPDATE questions SET status = ? WHERE id = ?', [nextStatus, questionId]);

        const updated = { ...oldValue, status: nextStatus };
        await writeAuditLog(req.user.id, 'question', questionId, action, updated, oldValue);

        return res.status(200).json({
            message: `Question ${nextStatus} successfully`,
            question: { id: questionId, ...updated }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'An identical question already exists in this module' });
        }
        console.error('Error reviewing question:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const regenerateQuestions = async (req, res) => {
    try {
        const { moduleId } = req.params;
        let { ai_run_id, questions, retire_missing_generated = true } = req.body ?? {};
        if (!(await userOwnsModule(moduleId, req.user.id))) {
            return res.status(404).json({ message: 'Module not found' });
        }
        if (ai_run_id && !(await userOwnsAiRun(ai_run_id, req.user.id, 'question_generation'))) {
            return res.status(400).json({ message: 'ai_run_id must be a question_generation run owned by you' });
        }
        if (!Array.isArray(questions)) {
            const concepts = await executeQuery(
                `SELECT id, title, definition, facts FROM concepts
                 WHERE module_id = ? AND status IN ('accepted', 'edited', 'merged') AND is_outdated = FALSE
                 ORDER BY title ASC`,
                [moduleId]
            );
            const mockQuestions = concepts.map((concept) => ({
                concept_id: concept.id,
                question_type: 'short_answer',
                question_text: `Briefly explain: ${concept.title}.`,
                options: null,
                correct_answer: concept.definition || parseJson(concept.facts, [concept.title])[0] || concept.title,
                difficulty: 3
            }));
            const aiResult = await generateQuestionsWithAi(concepts.map((concept) => ({
                concept_id: concept.id,
                title: concept.title,
                definition: concept.definition,
                facts: parseJson(concept.facts, [])
            })));
            const aiQuestions = aiResult?.data?.questions?.filter((question) =>
                typeof question.concept_id === 'string' && typeof question.question_type === 'string' &&
                typeof question.question_text === 'string' && typeof question.correct_answer === 'string' &&
                Number.isInteger(question.difficulty)
            );
            questions = aiQuestions?.length ? aiQuestions : mockQuestions;
            ai_run_id = await newId();
            await executeQuery(
                `INSERT INTO ai_runs (id, user_id, run_type, model, prompt_version, input_data, output_data)
                 VALUES (?, ?, 'question_generation', ?, ?, ?, ?)`,
                [ai_run_id, req.user.id, aiResult?.model ?? 'deterministic-local-v1',
                    aiResult ? 'question-generation-v1' : 'mock-question-generation-v1',
                    JSON.stringify({ module_id: moduleId }), JSON.stringify({ question_count: questions.length,
                        response_id: aiResult?.responseId ?? null,
                        strategy: aiResult ? 'Gemini generation' : 'one short-answer question per active concept' })]
            );
        }
        if (!questions.length) {
            return res.status(400).json({ message: 'questions must be a non-empty array' });
        }

        const incomingHashes = new Set();
        const created = [];
        const updated = [];
        const preserved = [];

        for (const candidate of questions) {
            const { concept_id, question_type, question_text, options = null, correct_answer, difficulty = 3 } = candidate;
            if (!concept_id || !question_type || !question_text || !correct_answer ||
                !['mcq', 'true_false', 'short_answer'].includes(question_type) ||
                !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
                return res.status(400).json({ message: 'Each question needs valid concept_id, type, text, answer, and difficulty (1-5)' });
            }
            const concept = await userOwnsConcept(concept_id, req.user.id);
            if (!concept || concept.module_id !== moduleId || !['accepted', 'edited', 'merged'].includes(concept.status)) {
                return res.status(400).json({ message: 'Questions can only be generated for accepted or edited concepts in this module' });
            }

            const contentHash = questionHash(candidate);
            incomingHashes.add(contentHash);
            const existingRows = await executeQuery(
                'SELECT id, status FROM questions WHERE module_id = ? AND content_hash = ?',
                [moduleId, contentHash]
            );
            const existing = existingRows[0];
            if (existing && existing.status !== 'generated') {
                preserved.push(existing.id);
                continue;
            }

            if (existing) {
                const versionRows = await executeQuery(
                    'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM question_versions WHERE question_id = ?',
                    [existing.id]
                );
                const versionId = await newId();
                await executeQuery(
                    `UPDATE questions SET ai_run_id = ?, question_text = ?, options = ?, correct_answer = ?, difficulty = ?
                     WHERE id = ?`,
                    [ai_run_id, question_text, jsonValue(options), correct_answer, difficulty, existing.id]
                );
                await executeQuery(
                    `INSERT INTO question_versions
                        (id, question_id, version, question_type, question_text, options, correct_answer, difficulty)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [versionId, existing.id, versionRows[0].next_version, question_type, question_text,
                        jsonValue(options), correct_answer, difficulty]
                );
                updated.push(existing.id);
                continue;
            }

            const questionId = await newId();
            const versionId = await newId();
            await executeQuery(
                `INSERT INTO questions
                    (id, module_id, concept_id, ai_run_id, question_type, question_text, options,
                     correct_answer, content_hash, difficulty, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated')`,
                [questionId, moduleId, concept_id, ai_run_id, question_type, question_text,
                    jsonValue(options), correct_answer, contentHash, difficulty]
            );
            await executeQuery(
                `INSERT INTO question_versions
                    (id, question_id, version, question_type, question_text, options, correct_answer, difficulty)
                 VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
                [versionId, questionId, question_type, question_text, jsonValue(options), correct_answer, difficulty]
            );
            created.push(questionId);
        }

        const retired = [];
        if (retire_missing_generated) {
            const generatedRows = await executeQuery(
                `SELECT id, content_hash FROM questions WHERE module_id = ? AND status = 'generated'`,
                [moduleId]
            );
            const obsolete = generatedRows.filter((row) => !incomingHashes.has(row.content_hash));
            for (const question of obsolete) {
                await executeQuery("UPDATE questions SET status = 'retired' WHERE id = ?", [question.id]);
                retired.push(question.id);
            }
        }

        const summary = { created, updated, preserved, retired, ai_run_id };
        await writeAuditLog(req.user.id, 'module', moduleId, 'questions_regenerated', summary);
        return res.status(200).json({ message: 'Questions regenerated successfully', ...summary });
    } catch (error) {
        console.error('Error regenerating questions:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createStudySession = async (req, res) => {
    try {
        const {
            module_id,
            question_count = 10,
            question_types = ['mcq', 'true_false', 'short_answer'],
            focus_mode = false
        } = req.body;

        if (!module_id) {
            return res.status(400).json({ message: 'module_id is required' });
        }
        if (!Number.isInteger(question_count) || question_count < 1 || question_count > 50) {
            return res.status(400).json({ message: 'question_count must be an integer from 1 to 50' });
        }
        if (!Array.isArray(question_types) || !question_types.length ||
            question_types.some((type) => !['mcq', 'true_false', 'short_answer'].includes(type))) {
            return res.status(400).json({ message: 'question_types must contain mcq, true_false, and/or short_answer' });
        }
        if (!(await userOwnsModule(module_id, req.user.id))) {
            return res.status(403).json({ message: 'You do not have access to this module' });
        }

        const typePlaceholders = question_types.map(() => '?').join(', ');
        const selectedQuestions = await executeQuery(
            `SELECT q.id, q.question_type, q.question_text, q.options, q.difficulty,
                    qv.id AS question_version_id, c.title AS concept_title, COALESCE(m.score, 0) AS mastery_score
             FROM questions q
             JOIN question_versions qv ON qv.question_id = q.id
                AND qv.version = (SELECT MAX(version) FROM question_versions WHERE question_id = q.id)
             JOIN concepts c ON c.id = q.concept_id
             LEFT JOIN mastery m ON m.concept_id = c.id AND m.user_id = ?
             WHERE q.module_id = ? AND q.status IN ('approved', 'edited')
               AND c.status IN ('accepted', 'edited', 'merged') AND c.is_outdated = FALSE
               AND q.question_type IN (${typePlaceholders})
             ORDER BY CASE WHEN ? THEN COALESCE(m.score, 0) ELSE 0 END ASC, q.created_at ASC, q.id ASC
             LIMIT ?`,
            [req.user.id, module_id, ...question_types, Boolean(focus_mode), question_count]
        );
        if (selectedQuestions.length < question_count) {
            return res.status(400).json({
                message: `Only ${selectedQuestions.length} eligible question(s) are available for this session`
            });
        }

        const sessionId = await newId();
        await executeQuery(
            `INSERT INTO study_sessions (id, user_id, module_id, question_count, question_types, focus_mode)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, req.user.id, module_id, question_count, JSON.stringify(question_types), Boolean(focus_mode)]
        );
        for (const [index, question] of selectedQuestions.entries()) {
            await executeQuery(
                `INSERT INTO study_session_questions
                    (id, study_session_id, question_id, question_version_id, display_order)
                 VALUES (?, ?, ?, ?, ?)`,
                [await newId(), sessionId, question.id, question.question_version_id, index + 1]
            );
        }

        await writeAuditLog(req.user.id, 'study_session', sessionId, 'started', {
            module_id, question_count, question_types, focus_mode: Boolean(focus_mode),
            question_ids: selectedQuestions.map((question) => question.id)
        });

        return res.status(201).json({
            message: 'Study session started successfully',
            study_session: { id: sessionId, module_id, question_count, question_types, focus_mode: Boolean(focus_mode) },
            questions: selectedQuestions
        });
    } catch (error) {
        console.error('Error creating study session:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getStudySessionQuestions = async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!(await userOwnsStudySession(sessionId, req.user.id))) {
            return res.status(404).json({ message: 'Study session not found' });
        }
        const questions = await executeQuery(
            `SELECT ssq.display_order, q.id, q.question_type, q.question_text, q.options,
                    q.difficulty, qv.id AS question_version_id, c.title AS concept_title
             FROM study_session_questions ssq
             JOIN questions q ON q.id = ssq.question_id
             JOIN question_versions qv ON qv.id = ssq.question_version_id
             JOIN concepts c ON c.id = q.concept_id
             WHERE ssq.study_session_id = ?
             ORDER BY ssq.display_order ASC`,
            [sessionId]
        );
        return res.status(200).json({ questions });
    } catch (error) {
        console.error('Error getting study session questions:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const endStudySession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await userOwnsStudySession(sessionId, req.user.id);
        if (!session) return res.status(404).json({ message: 'Study session not found' });
        await executeQuery('UPDATE study_sessions SET ended_at = COALESCE(ended_at, NOW()) WHERE id = ?', [sessionId]);
        await writeAuditLog(req.user.id, 'study_session', sessionId, 'ended', { module_id: session.module_id });
        return res.status(200).json({ message: 'Study session ended successfully' });
    } catch (error) {
        console.error('Error ending study session:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const createAttempt = async (req, res) => {
    try {
        const {
            study_session_id,
            question_id,
            question_version_id,
            user_answer = null,
            result = null,
            confidence = null,
            grading_reason = null,
            grading_ai_run_id = null,
            time_taken_seconds = null
        } = req.body;

        if (!study_session_id || !question_id || !question_version_id) {
            return res.status(400).json({
                message: 'study_session_id, question_id, and question_version_id are required'
            });
        }
        if (result && !['correct', 'incorrect', 'partial'].includes(result)) {
            return res.status(400).json({ message: 'Invalid attempt result' });
        }
        if (confidence !== null && (Number(confidence) < 0 || Number(confidence) > 100)) {
            return res.status(400).json({ message: 'confidence must be between 0 and 100' });
        }

        const session = await userOwnsStudySession(study_session_id, req.user.id);
        if (!session) {
            return res.status(403).json({ message: 'You do not have access to this study session' });
        }
        if (session.ended_at) {
            return res.status(400).json({ message: 'Cannot add an attempt to an ended study session' });
        }

        const question = await executeQuery(
            `SELECT q.id, q.concept_id
             FROM questions q
             JOIN question_versions qv ON qv.question_id = q.id
             WHERE q.id = ? AND qv.id = ? AND q.module_id = ?`,
            [question_id, question_version_id, session.module_id]
        );
        if (!question.length) {
            return res.status(400).json({
                message: 'The question version does not belong to this question and study session module'
            });
        }
        const selectedRows = await executeQuery(
            `SELECT id FROM study_session_questions
             WHERE study_session_id = ? AND question_id = ? AND question_version_id = ?`,
            [study_session_id, question_id, question_version_id]
        );
        if (selectedRows.length === 0) {
            return res.status(400).json({ message: 'This question was not selected for the study session' });
        }

        const attemptId = await newId();
        await executeQuery(
            `INSERT INTO attempts
                (id, study_session_id, question_id, question_version_id, grading_ai_run_id,
                 user_answer, result, confidence, grading_reason, time_taken_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                attemptId,
                study_session_id,
                question_id,
                question_version_id,
                grading_ai_run_id,
                user_answer,
                result,
                confidence,
                grading_reason,
                time_taken_seconds
            ]
        );

        await writeAuditLog(req.user.id, 'attempt', attemptId, 'created', { result });

        return res.status(201).json({
            message: 'Attempt recorded successfully',
            attempt: { id: attemptId, study_session_id, question_id, result }
        });
    } catch (error) {
        console.error('Error creating attempt:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const gradeAttempt = async (req, res) => {
    try {
        const { attemptId } = req.params;
        const { result, confidence = null, grading_reason = null, grading_ai_run_id = null } = req.body ?? {};
        const attempt = await userOwnsAttempt(attemptId, req.user.id);

        if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
        if (grading_ai_run_id && !(await userOwnsAiRun(grading_ai_run_id, req.user.id, 'grading'))) {
            return res.status(400).json({ message: 'grading_ai_run_id must be a grading run owned by you' });
        }
        if (attempt.overridden) {
            return res.status(400).json({ message: 'This attempt has a user override and cannot be re-graded' });
        }

        let finalResult;
        let finalConfidence = confidence;
        let finalReason = grading_reason;
        let finalAiRunId = grading_ai_run_id;

        if (attempt.question_type === 'mcq' || attempt.question_type === 'true_false') {
            const answerRows = await executeQuery('SELECT user_answer FROM attempts WHERE id = ?', [attemptId]);
            const submitted = (answerRows[0].user_answer ?? '').trim().toLowerCase();
            const expected = attempt.correct_answer.trim().toLowerCase();
            finalResult = submitted === expected ? 'correct' : 'incorrect';
            finalConfidence = 100;
            finalReason = 'Deterministic comparison with the stored expected answer.';
        } else {
            if (result === undefined || result === null) {
                const answerRows = await executeQuery('SELECT user_answer FROM attempts WHERE id = ?', [attemptId]);
                const aiResult = await gradeShortAnswerWithAi({
                    question: attempt.question_text,
                    expectedAnswer: attempt.correct_answer,
                    userAnswer: answerRows[0].user_answer
                });
                const expected = answerTokens(attempt.correct_answer);
                const submitted = answerTokens(answerRows[0].user_answer);
                const matched = [...expected].filter((token) => submitted.has(token)).length;
                const overlap = expected.size ? matched / expected.size : 0;
                finalResult = aiResult?.data?.result ?? (overlap >= 0.7 ? 'correct' : overlap >= 0.3 ? 'partial' : 'incorrect');
                finalConfidence = aiResult?.data?.confidence ?? Math.round(Math.min(95, 50 + overlap * 45));
                finalReason = aiResult?.data?.grading_reason
                    ?? `Deterministic mock grading matched ${matched} of ${expected.size} expected key terms.`;
                finalAiRunId = await newId();
                await executeQuery(
                    `INSERT INTO ai_runs (id, user_id, run_type, model, prompt_version, input_data, output_data)
                     VALUES (?, ?, 'grading', ?, ?, ?, ?)`,
                    [finalAiRunId, req.user.id, aiResult?.model ?? 'deterministic-local-v1',
                        aiResult ? 'short-answer-grading-v1' : 'mock-short-answer-grading-v1',
                        JSON.stringify({ attempt_id: attemptId, expected_answer: attempt.correct_answer, user_answer: answerRows[0].user_answer }),
                        JSON.stringify({ result: finalResult, confidence: finalConfidence, rationale: finalReason,
                            response_id: aiResult?.responseId ?? null })]
                );
            } else {
                if (!['correct', 'incorrect', 'partial'].includes(result)) {
                    return res.status(400).json({ message: 'Short-answer result must be correct, partial, or incorrect' });
                }
                if (confidence === null || Number(confidence) < 0 || Number(confidence) > 100 || !grading_reason) {
                    return res.status(400).json({
                        message: 'Externally graded short answers require confidence (0-100) and grading_reason'
                    });
                }
                finalResult = result;
            }
        }

        await executeQuery(
            `UPDATE attempts
             SET result = ?, confidence = ?, grading_reason = ?, grading_ai_run_id = ?
             WHERE id = ?`,
            [finalResult, finalConfidence, finalReason, finalAiRunId, attemptId]
        );
        await recalculateSessionScore(attempt.study_session_id);
        const mastery = await recalculateMastery(req.user.id, attempt.concept_id);
        await writeMasteryRecalculationAudit(req.user.id, attempt.concept_id, mastery, 'attempt_graded');
        await writeAuditLog(req.user.id, 'attempt', attemptId, 'graded', {
            result: finalResult, confidence: finalConfidence, grading_reason: finalReason, mastery
        }, { result: attempt.result, confidence: attempt.confidence, grading_reason: attempt.grading_reason });

        return res.status(200).json({
            message: 'Attempt graded successfully',
            attempt: { id: attemptId, result: finalResult, confidence: finalConfidence, grading_reason: finalReason },
            mastery
        });
    } catch (error) {
        console.error('Error grading attempt:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const overrideAttemptGrade = async (req, res) => {
    try {
        const { attemptId } = req.params;
        const { result, override_reason = null } = req.body;
        if (!['correct', 'incorrect', 'partial'].includes(result)) {
            return res.status(400).json({ message: 'result must be correct, partial, or incorrect' });
        }

        const attempt = await userOwnsAttempt(attemptId, req.user.id);
        if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

        await executeQuery(
            `UPDATE attempts
             SET result = ?, overridden = TRUE, override_reason = ?
             WHERE id = ?`,
            [result, override_reason, attemptId]
        );
        await recalculateSessionScore(attempt.study_session_id);
        const mastery = await recalculateMastery(req.user.id, attempt.concept_id);
        await writeMasteryRecalculationAudit(req.user.id, attempt.concept_id, mastery, 'grade_overridden');
        await writeAuditLog(req.user.id, 'attempt', attemptId, 'grade_overridden', {
            result, overridden: true, override_reason, mastery
        }, {
            result: attempt.result, overridden: Boolean(attempt.overridden), override_reason: attempt.override_reason
        });

        return res.status(200).json({
            message: 'Attempt grade overridden successfully',
            attempt: { id: attemptId, result, overridden: true, override_reason },
            mastery
        });
    } catch (error) {
        console.error('Error overriding attempt grade:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getDueReviews = async (req, res) => {
    try {
        const { module_id } = req.query;
        if (!module_id) return res.status(400).json({ message: 'module_id is required' });
        if (!(await userOwnsModule(module_id, req.user.id))) {
            return res.status(403).json({ message: 'You do not have access to this module' });
        }

        const rows = await executeQuery(
            `SELECT c.id AS concept_id, c.title, m.score, m.last_reviewed_at, m.next_review_at,
                    m.calculation_metadata
             FROM mastery m
             JOIN concepts c ON c.id = m.concept_id
             WHERE m.user_id = ? AND c.module_id = ?
               AND c.status IN ('accepted', 'edited', 'merged')
               AND c.is_outdated = FALSE
               AND m.next_review_at <= NOW()
             ORDER BY m.next_review_at ASC, m.score ASC, c.title ASC`,
            [req.user.id, module_id]
        );

        const due_reviews = rows.map((row) => {
            const metadata = typeof row.calculation_metadata === 'string'
                ? JSON.parse(row.calculation_metadata)
                : row.calculation_metadata ?? {};
            const daysSinceReview = row.last_reviewed_at
                ? Math.floor((Date.now() - new Date(row.last_reviewed_at)) / 86_400_000)
                : null;
            return {
                concept_id: row.concept_id,
                title: row.title,
                mastery_score: row.score,
                bucket: metadata.bucket ?? masteryBucket(row.score).label,
                due_at: row.next_review_at,
                why_due: `${daysSinceReview ?? 0} day(s) since last review; mastery ${row.score}; last attempt ${metadata.last_result ?? 'none'}.`
            };
        });

        return res.status(200).json({ due_reviews });
    } catch (error) {
        console.error('Error getting due reviews:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleSources = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) {
            return res.status(404).json({ message: 'Module not found' });
        }
        const sources = await executeQuery(
            `SELECT src.id, src.module_id, src.title, src.source_type, src.current_version, src.status,
                    src.created_at, src.updated_at, sv.id AS current_source_version_id,
                    CASE WHEN src.source_type = 'pdf' THEN NULL ELSE sv.raw_text END AS raw_text
             FROM sources src
             JOIN source_versions sv ON sv.source_id = src.id AND sv.version = src.current_version
             WHERE src.module_id = ?
             ORDER BY src.updated_at DESC, src.title ASC`,
            [moduleId]
        );
        return res.status(200).json({ sources });
    } catch (error) {
        console.error('Error getting module sources:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getSourceVersions = async (req, res) => {
    try {
        const { sourceId } = req.params;
        const source = await userOwnsSource(sourceId, req.user.id);
        if (!source) return res.status(404).json({ message: 'Source not found' });

        const versions = await executeQuery(
            `SELECT sv.id, sv.version,
                    CASE WHEN src.source_type = 'pdf' THEN NULL ELSE sv.raw_text END AS raw_text,
                    sv.created_at
             FROM source_versions sv
             JOIN sources src ON src.id = sv.source_id
             WHERE sv.source_id = ?
             ORDER BY sv.version DESC`,
            [sourceId]
        );
        return res.status(200).json({ current_version: source.current_version, versions });
    } catch (error) {
        console.error('Error getting source versions:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleConcepts = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) {
            return res.status(404).json({ message: 'Module not found' });
        }
        const concepts = await executeQuery(
            `SELECT c.id, c.module_id, c.source_version_id, c.source_excerpt, c.ai_run_id,
                    c.merged_into_concept_id, c.title, c.definition, c.facts, c.tags,
                    c.status, c.is_outdated, c.created_at, c.updated_at,
                    m.score AS mastery_score, m.last_reviewed_at, m.next_review_at
             FROM concepts c
             LEFT JOIN mastery m ON m.concept_id = c.id AND m.user_id = ?
             WHERE c.module_id = ?
             ORDER BY c.updated_at DESC, c.title ASC`,
            [req.user.id, moduleId]
        );
        return res.status(200).json({ concepts });
    } catch (error) {
        console.error('Error getting module concepts:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// Concept edits are immutable in the audit log. The version picker reads those
// snapshots, so no extra database table is needed for concept history.
export const getConceptVersions = async (req, res) => {
    try {
        const { conceptId } = req.params;
        if (!(await userOwnsConcept(conceptId, req.user.id))) {
            return res.status(404).json({ message: 'Concept not found' });
        }

        const currentRows = await executeQuery(
            `SELECT title, definition, facts, tags, status, updated_at
             FROM concepts WHERE id = ?`,
            [conceptId]
        );
        const edits = await executeQuery(
            `SELECT old_value, created_at
             FROM audit_logs
             WHERE entity_type = 'concept' AND entity_id = ? AND action = 'edit'
             ORDER BY created_at ASC`,
            [conceptId]
        );
        const versions = edits.map((edit, index) => ({
            version: index + 1,
            ...parseJson(edit.old_value, {}),
            created_at: edit.created_at
        }));
        versions.push({
            version: edits.length + 1,
            ...currentRows[0],
            created_at: currentRows[0].updated_at
        });

        return res.status(200).json({
            current_version: versions.length,
            versions: versions.reverse()
        });
    } catch (error) {
        console.error('Error getting concept versions:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleQuestions = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) {
            return res.status(404).json({ message: 'Module not found' });
        }
        const questions = await executeQuery(
            `SELECT q.id, q.module_id, q.concept_id, q.ai_run_id, q.question_type, q.question_text,
                    q.options, q.correct_answer, q.difficulty, q.status, q.created_at, q.updated_at,
                    c.title AS concept_title,
                    (SELECT MAX(qv.version) FROM question_versions qv WHERE qv.question_id = q.id) AS current_version
             FROM questions q
             JOIN concepts c ON c.id = q.concept_id
             WHERE q.module_id = ?
             ORDER BY q.updated_at DESC, q.question_text ASC`,
            [moduleId]
        );
        return res.status(200).json({ questions });
    } catch (error) {
        console.error('Error getting module questions:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleStudySessions = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) {
            return res.status(404).json({ message: 'Module not found' });
        }
        const study_sessions = await executeQuery(
            `SELECT ss.id, ss.module_id, ss.score, ss.started_at, ss.ended_at,
                    COUNT(a.id) AS attempt_count
             FROM study_sessions ss
             LEFT JOIN attempts a ON a.study_session_id = ss.id
             WHERE ss.module_id = ? AND ss.user_id = ?
             GROUP BY ss.id
             ORDER BY ss.started_at DESC`,
            [moduleId, req.user.id]
        );
        return res.status(200).json({ study_sessions });
    } catch (error) {
        console.error('Error getting study sessions:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getStudySessionAttempts = async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!(await userOwnsStudySession(sessionId, req.user.id))) {
            return res.status(404).json({ message: 'Study session not found' });
        }
        const attempts = await executeQuery(
            `SELECT a.id, a.question_id, a.question_version_id, a.user_answer, a.result,
                    a.confidence, a.grading_reason, a.overridden, a.override_reason,
                    a.time_taken_seconds, a.created_at, q.question_type, q.question_text,
                    q.options, q.correct_answer, c.id AS concept_id, c.title AS concept_title
             FROM attempts a
             JOIN questions q ON q.id = a.question_id
             JOIN concepts c ON c.id = q.concept_id
             WHERE a.study_session_id = ?
             ORDER BY a.created_at ASC`,
            [sessionId]
        );
        return res.status(200).json({ attempts });
    } catch (error) {
        console.error('Error getting study session attempts:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const searchLearningContent = async (req, res) => {
    try {
        const query = req.query.q?.trim();
        if (!query || query.length < 2) {
            return res.status(400).json({ message: 'q must contain at least 2 characters' });
        }
        const pattern = `%${query}%`;
        const concepts = await executeQuery(
            `SELECT c.id, c.title, c.definition, c.tags, c.module_id, m.name AS module_name
             FROM concepts c
             JOIN modules m ON m.id = c.module_id
             JOIN subjects s ON s.id = m.subject_id
             JOIN workspaces w ON w.id = s.workspace_id
             WHERE w.user_id = ? AND c.status IN ('accepted', 'edited', 'merged') AND c.is_outdated = FALSE
               AND (c.title LIKE ? OR c.definition LIKE ? OR CAST(c.facts AS CHAR) LIKE ? OR CAST(c.tags AS CHAR) LIKE ?)
             ORDER BY c.title ASC LIMIT 25`,
            [req.user.id, pattern, pattern, pattern, pattern]
        );
        const questions = await executeQuery(
            `SELECT q.id, q.question_text, q.question_type, q.difficulty, q.module_id,
                    c.title AS concept_title, m.name AS module_name
             FROM questions q
             JOIN concepts c ON c.id = q.concept_id
             JOIN modules m ON m.id = q.module_id
             JOIN subjects s ON s.id = m.subject_id
             JOIN workspaces w ON w.id = s.workspace_id
             WHERE w.user_id = ? AND q.status IN ('generated', 'approved', 'edited')
               AND q.question_text LIKE ?
             ORDER BY q.question_text ASC LIMIT 25`,
            [req.user.id, pattern]
        );
        return res.status(200).json({ concepts, questions });
    } catch (error) {
        console.error('Error searching learning content:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleInsights = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) {
            return res.status(404).json({ message: 'Module not found' });
        }
        const distributionRows = await executeQuery(
            `SELECT
                SUM(CASE WHEN COALESCE(m.score, 0) < 25 THEN 1 ELSE 0 END) AS new_count,
                SUM(CASE WHEN COALESCE(m.score, 0) BETWEEN 25 AND 49 THEN 1 ELSE 0 END) AS learning_count,
                SUM(CASE WHEN COALESCE(m.score, 0) BETWEEN 50 AND 74 THEN 1 ELSE 0 END) AS proficient_count,
                SUM(CASE WHEN COALESCE(m.score, 0) >= 75 THEN 1 ELSE 0 END) AS mastered_count
             FROM concepts c
             LEFT JOIN mastery m ON m.concept_id = c.id AND m.user_id = ?
             WHERE c.module_id = ? AND c.status IN ('accepted', 'edited', 'merged') AND c.is_outdated = FALSE`,
            [req.user.id, moduleId]
        );
        const trendRows = await executeQuery(
            `SELECT DATE(a.created_at) AS day, COUNT(*) AS attempts,
                    SUM(a.result = 'correct') AS correct_count,
                    SUM(a.result = 'partial') AS partial_count
             FROM attempts a
             JOIN study_sessions ss ON ss.id = a.study_session_id
             WHERE ss.user_id = ? AND ss.module_id = ? AND a.result IS NOT NULL
               AND a.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(a.created_at) ORDER BY day ASC`,
            [req.user.id, moduleId]
        );
        const trendByDay = new Map(trendRows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row]));
        const accuracy_trend = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (6 - index));
            const day = date.toISOString().slice(0, 10);
            const row = trendByDay.get(day);
            const attempts = Number(row?.attempts ?? 0);
            const accuracy = attempts
                ? Math.round(((Number(row.correct_count) + Number(row.partial_count) * 0.5) / attempts) * 100)
                : null;
            return { day, attempts, accuracy };
        });
        const weak_concepts = await executeQuery(
            `SELECT c.id, c.title, COALESCE(m.score, 0) AS mastery_score,
                    SUM(CASE WHEN ss.id IS NOT NULL AND a.result = 'incorrect' AND a.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                        THEN 1 ELSE 0 END) AS recent_incorrect_count
             FROM concepts c
             LEFT JOIN mastery m ON m.concept_id = c.id AND m.user_id = ?
             LEFT JOIN questions q ON q.concept_id = c.id
             LEFT JOIN attempts a ON a.question_id = q.id
             LEFT JOIN study_sessions ss ON ss.id = a.study_session_id AND ss.user_id = ?
             WHERE c.module_id = ? AND c.status IN ('accepted', 'edited', 'merged') AND c.is_outdated = FALSE
             GROUP BY c.id, c.title, m.score
             ORDER BY mastery_score ASC, recent_incorrect_count DESC, c.title ASC LIMIT 5`,
            [req.user.id, req.user.id, moduleId]
        );
        return res.status(200).json({
            mastery_distribution: distributionRows[0] ?? { new_count: 0, learning_count: 0, proficient_count: 0, mastered_count: 0 },
            accuracy_trend,
            weak_concepts
        });
    } catch (error) {
        console.error('Error getting module insights:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleAiRuns = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) return res.status(404).json({ message: 'Module not found' });
        const ai_runs = await executeQuery(
            `SELECT DISTINCT ar.id, ar.run_type, ar.model, ar.prompt_version, ar.input_data, ar.output_data, ar.created_at
             FROM ai_runs ar
             LEFT JOIN concepts c ON c.ai_run_id = ar.id
             LEFT JOIN questions q ON q.ai_run_id = ar.id
             LEFT JOIN attempts a ON a.grading_ai_run_id = ar.id
             LEFT JOIN study_sessions ss ON ss.id = a.study_session_id
             WHERE ar.user_id = ? AND (c.module_id = ? OR q.module_id = ? OR ss.module_id = ?
                 OR JSON_UNQUOTE(JSON_EXTRACT(ar.input_data, '$.module_id')) = ?)
             ORDER BY ar.created_at DESC`,
            [req.user.id, moduleId, moduleId, moduleId, moduleId]
        );
        return res.status(200).json({ ai_runs });
    } catch (error) {
        console.error('Error getting module AI runs:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleAuditLogs = async (req, res) => {
    try {
        const { moduleId } = req.params;
        if (!(await userOwnsModule(moduleId, req.user.id))) return res.status(404).json({ message: 'Module not found' });
        const audit_logs = await executeQuery(
            `SELECT al.id, al.entity_type, al.entity_id, al.action, al.old_value, al.new_value, al.created_at
             FROM audit_logs al WHERE al.user_id = ? AND (
                 (al.entity_type = 'module' AND al.entity_id = ?)
                 OR (al.entity_type = 'source' AND EXISTS (SELECT 1 FROM sources src WHERE src.id = al.entity_id AND src.module_id = ?))
                 OR (al.entity_type = 'concept' AND EXISTS (SELECT 1 FROM concepts c WHERE c.id = al.entity_id AND c.module_id = ?))
                 OR (al.entity_type = 'question' AND EXISTS (SELECT 1 FROM questions q WHERE q.id = al.entity_id AND q.module_id = ?))
                 OR (al.entity_type = 'study_session' AND EXISTS (SELECT 1 FROM study_sessions ss WHERE ss.id = al.entity_id AND ss.module_id = ?))
                 OR (al.entity_type = 'attempt' AND EXISTS (SELECT 1 FROM attempts a JOIN study_sessions ss ON ss.id = a.study_session_id WHERE a.id = al.entity_id AND ss.module_id = ?))
                 OR (al.entity_type = 'mastery' AND EXISTS (SELECT 1 FROM concepts c WHERE c.id = al.entity_id AND c.module_id = ?))
             ) ORDER BY al.created_at DESC`,
            [req.user.id, moduleId, moduleId, moduleId, moduleId, moduleId, moduleId, moduleId]
        );
        return res.status(200).json({ audit_logs });
    } catch (error) {
        console.error('Error getting module audit logs:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
