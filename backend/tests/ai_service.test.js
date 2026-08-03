import assert from 'node:assert/strict';
import test from 'node:test';
import {
    extractConceptsWithAi,
    generateQuestionsWithAi,
    gradeShortAnswerWithAi,
    isAiConfigured
} from '../services/ai_service.js';

test('AI service uses the local fallback path when no Gemini key is configured', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    assert.equal(isAiConfigured(), false);
    assert.equal(await extractConceptsWithAi('A short source.'), null);
    assert.equal(await generateQuestionsWithAi([]), null);
    assert.equal(await gradeShortAnswerWithAi({ question: 'Q', expectedAnswer: 'A', userAnswer: 'B' }), null);

    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
});
