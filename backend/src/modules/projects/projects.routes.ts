import { Router } from 'express';
import * as projectsController from './projects.controller';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';

const router = Router();

router.use(authenticate);

// All roles can view
router.get('/', projectsController.listProjects);
router.get('/stats', projectsController.getStats);
router.get('/:id', projectsController.getProjectById);

// Only ADM and TECNICO can create/update
router.post('/', authorize('ADM', 'TECNICO'), projectsController.createProject);
router.put('/:id', authorize('ADM', 'TECNICO'), projectsController.updateProject);
router.put('/:id/workflow', authorize('ADM', 'TECNICO'), projectsController.saveWorkflow);

// Only ADM can delete
router.delete('/:id', authorize('ADM'), projectsController.deleteProject);

export default router;
