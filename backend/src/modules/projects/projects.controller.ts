import { Request, Response, NextFunction } from 'express';
import * as projectsService from './projects.service';
import { createProjectSchema, updateProjectSchema, saveWorkflowSchema } from './projects.schema';

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await projectsService.listProjects(page, limit);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function getProjectById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const project = await projectsService.getProjectById(req.params.id);
    res.json({ status: 'success', data: { project } });
  } catch (error) {
    next(error);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createProjectSchema.parse(req.body);
    const project = await projectsService.createProject(data);
    res.status(201).json({ status: 'success', data: { project } });
  } catch (error) {
    next(error);
  }
}

export async function updateProject(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const data = updateProjectSchema.parse(req.body);
    const project = await projectsService.updateProject(req.params.id, data);
    res.json({ status: 'success', data: { project } });
  } catch (error) {
    next(error);
  }
}

export async function deleteProject(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    await projectsService.deleteProject(req.params.id);
    res.json({ status: 'success', message: 'Project deleted' });
  } catch (error) {
    next(error);
  }
}

export async function saveWorkflow(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const data = saveWorkflowSchema.parse(req.body);
    const steps = await projectsService.saveWorkflow(req.params.id, data);
    res.json({ status: 'success', data: { steps } });
  } catch (error) {
    next(error);
  }
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await projectsService.getProjectStats();
    res.json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
}
