import { Router } from 'express';
import {
    createWorkspace,
    createSubject,
    createModule,
    getWorkspaces,
    getWorkspaceSubjects,
    getSubjectModules,
    getModule,
    updateWorkspace,
    updateSubject,
    updateModule
} from '../controllers/content_controllers.js';
import protectRoute from '../middleware/protectRoute.js';

const router = Router();

router.get('/workspaces', protectRoute, getWorkspaces);
router.get('/workspaces/:workspaceId/subjects', protectRoute, getWorkspaceSubjects);
router.get('/subjects/:subjectId/modules', protectRoute, getSubjectModules);
router.get('/modules/:moduleId', protectRoute, getModule);
// router.patch('/workspaces/:workspaceId', protectRoute, updateWorkspace);
// router.patch('/subjects/:subjectId', protectRoute, updateSubject);
// router.patch('/modules/:moduleId', protectRoute, updateModule);
router.post('/create-workspace', protectRoute, createWorkspace);
router.post('/create-subject', protectRoute, createSubject);
router.post('/create-module', protectRoute, createModule)
export default router;
