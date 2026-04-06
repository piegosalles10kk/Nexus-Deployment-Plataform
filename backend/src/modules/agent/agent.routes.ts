import { Router } from 'express';
import * as agentController from './agent.controller';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';

const router = Router();

// ── Public enrollment endpoint (auth via enrollment JWT, not user session) ────
// Called by install.sh / install.ps1 during provisioning
router.post('/enroll', agentController.enrollAgent);

// ── Protected node management (ADM only) ─────────────────────────────────────
router.get(   '/nodes',             authenticate, authorize('ADM'), agentController.listNodes);
router.post(  '/nodes',             authenticate, authorize('ADM'), agentController.createNode);
router.delete('/nodes/:id',         authenticate, authorize('ADM'), agentController.deleteNode);
router.post(  '/nodes/:id/command', authenticate, authorize('ADM'), agentController.sendCommand);
router.get(   '/nodes/:id/telemetry', authenticate, authorize('ADM'), agentController.getNodeTelemetry);

export default router;
