import { Router } from 'express';
import protectRoute from '../middleware/protectRoute.js';
import {
    createAiRun,
    createAttempt,
    createConcept,
    createQuestion,
    reviewConcept,
    reviewQuestion,
    gradeAttempt,
    getDueReviews,
    getModuleConcepts,
    getConceptVersions,
    getModuleQuestions,
    getModuleSources,
    getSourceVersions,
    getModuleStudySessions,
    getModuleInsights,
    getModuleAiRuns,
    getModuleAuditLogs,
    searchLearningContent,
    getStudySessionAttempts,
    getStudySessionQuestions,
    mergeConcepts,
    endStudySession,
    overrideAttemptGrade,
    processSource,
    regenerateQuestions,
    createSource,
    createSourceVersion,
    createStudySession
} from '../controllers/learning_controllers.js';

const router = Router();

router.post('/sources', protectRoute, createSource);
router.post('/source-versions', protectRoute, createSourceVersion);
router.post('/sources/:sourceId/process', protectRoute, processSource);
router.post('/ai-runs', protectRoute, createAiRun);
router.post('/concepts', protectRoute, createConcept);
router.patch('/concepts/:conceptId', protectRoute, reviewConcept);
router.patch('/concepts/:conceptId/merge', protectRoute, mergeConcepts);
router.post('/questions', protectRoute, createQuestion);
router.patch('/questions/:questionId', protectRoute, reviewQuestion);
router.post('/modules/:moduleId/questions/regenerate', protectRoute, regenerateQuestions);
router.post('/study-sessions', protectRoute, createStudySession);
router.get('/study-sessions/:sessionId/questions', protectRoute, getStudySessionQuestions);
router.patch('/study-sessions/:sessionId/end', protectRoute, endStudySession);
router.get('/modules/:moduleId/sources', protectRoute, getModuleSources);
router.get('/sources/:sourceId/versions', protectRoute, getSourceVersions);
router.get('/modules/:moduleId/concepts', protectRoute, getModuleConcepts);
router.get('/concepts/:conceptId/versions', protectRoute, getConceptVersions);
router.get('/modules/:moduleId/questions', protectRoute, getModuleQuestions);
router.get('/modules/:moduleId/study-sessions', protectRoute, getModuleStudySessions);
router.get('/modules/:moduleId/insights', protectRoute, getModuleInsights);
router.get('/modules/:moduleId/ai-runs', protectRoute, getModuleAiRuns);
router.get('/modules/:moduleId/audit-logs', protectRoute, getModuleAuditLogs);
router.get('/study-sessions/:sessionId/attempts', protectRoute, getStudySessionAttempts);
router.post('/attempts', protectRoute, createAttempt);
router.patch('/attempts/:attemptId/grade', protectRoute, gradeAttempt);
router.patch('/attempts/:attemptId/override', protectRoute, overrideAttemptGrade);
router.get('/mastery/due', protectRoute, getDueReviews);
router.get('/search', protectRoute, searchLearningContent);

export default router;
