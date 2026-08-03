import { GoogleGenAI } from '@google/genai';

const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const isAiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

const parseJsonOutput = (output) => {
    const trimmed = output.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(trimmed);
};

const requestJson = async (instructions, input) => {
    if (!isAiConfigured()) return null;
    try {
        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await client.models.generateContent({
            model,
            contents: input,
            config: {
                systemInstruction: instructions,
                responseMimeType: 'application/json'
            }
        });
        return { data: parseJsonOutput(response.text), model, responseId: response.responseId ?? null };
    } catch (error) {
        console.warn(`Gemini request failed; using deterministic fallback: ${error.message}`);
        return null;
    }
};

export const extractConceptsWithAi = async (sourceInput) => {
    const { rawText, pdfBase64 = null } = typeof sourceInput === 'string'
        ? { rawText: sourceInput }
        : sourceInput;
    const result = await requestJson(
        `Extract 1 to 8 study concepts from the source. Return only JSON in this shape:
{"concepts":[{"title":"string","definition":"string","facts":["string"],"tags":["string"],"source_excerpt":"exact supporting excerpt"}]}.
Facts must contain 3 to 8 concise strings. Do not invent facts absent from the source.`,
        pdfBase64
            ? [
                { text: 'Extract concepts from this PDF document.' },
                { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }
            ]
            : rawText
    );
    return Array.isArray(result?.data?.concepts) ? result : null;
};

export const generateQuestionsWithAi = async (concepts) => {
    const result = await requestJson(
        `Generate one useful practice question for each supplied study concept. Return only JSON:
{"questions":[{"concept_id":"string","question_type":"mcq|true_false|short_answer","question_text":"string","options":["string"],"correct_answer":"string","difficulty":1}]}
Use options only for MCQ. Difficulty must be an integer from 1 through 5. Ground every answer in the supplied concept.`,
        JSON.stringify({ concepts })
    );
    return Array.isArray(result?.data?.questions) ? result : null;
};

export const gradeShortAnswerWithAi = async ({ question, expectedAnswer, userAnswer }) => {
    const result = await requestJson(
        `Grade the learner's short answer against the expected answer. Return only JSON:
{"result":"correct|partial|incorrect","confidence":0,"grading_reason":"brief explanation of matched and missing points"}.
Use partial only when meaningful key ideas are present but incomplete.`,
        JSON.stringify({ question, expected_answer: expectedAnswer, user_answer: userAnswer })
    );
    if (!['correct', 'partial', 'incorrect'].includes(result?.data?.result) ||
        !Number.isFinite(Number(result?.data?.confidence)) || !result?.data?.grading_reason) {
        return null;
    }
    return result;
};
