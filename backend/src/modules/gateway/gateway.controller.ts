import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { discoverAvailablePorts } from './port-scan.service';
import { env } from '../../config/env';
import { getRedisClient } from '../../config/redis';

const generateRandomPath = (length = 8) => {
  return Math.random().toString(36).substring(2, 2 + length);
};

/**
 * Controller para gerenciamento das rotas do API Gateway
 */
export const GatewayController = {
  /**
   * Lista todas as rotas cadastradas
   */
  async getRoutes(req: Request, res: Response) {
    try {
      const routes = await prisma.gatewayRoute.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json(routes);
    } catch (error) {
      console.error('Error fetching gateway routes:', error);
      res.status(500).json({ message: 'Erro ao buscar rotas' });
    }
  },

  /**
   * Cria uma nova rota
   */
  async createRoute(req: Request, res: Response) {
    try {
      const { name, checkPort, isActive, routePath: customPath, targetUrl: customTarget } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'O nome da rota é obrigatório' });
      }

      const portNumber = parseInt(checkPort, 10) || 0;
      let finalPath = customPath;
      let finalTarget = customTarget;
      let finalIsActive = isActive !== undefined ? isActive : true;

      // Mode 1: Local Discovery (Port > 0)
      if (portNumber > 0) {
        if (!finalPath) {
          finalPath = `/service/${generateRandomPath()}`;
        }
        if (!finalTarget) {
          finalTarget = `http://${env.PORT_CHECK_HOST}:${portNumber}`;
        }
      } else {
        // Mode 2: Public Route (Port = 0)
        if (!finalPath || !finalTarget) {
          return res.status(400).json({ message: 'Caminho e URL de destino são obrigatórios para rotas públicas' });
        }
      }

      // Normalize path
      if (!finalPath.startsWith('/')) {
        finalPath = '/' + finalPath;
      }

      const route = await prisma.gatewayRoute.create({
        data: {
          name,
          routePath: finalPath,
          targetUrl: finalTarget,
          checkPort: portNumber,
          isActive: finalIsActive,
        },
      });

      res.status(201).json(route);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(400).json({ message: 'Caminho de rota ou nome já existe' });
      }
      console.error('Error creating gateway route:', error);
      res.status(500).json({ message: 'Erro ao criar rota' });
    }
  },

  /**
   * Atualiza uma rota existente
   */
  async updateRoute(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { name, routePath, targetUrl, checkPort, isActive } = req.body;

      const portNumber = parseInt(checkPort, 10) || 0;

      const route = await prisma.gatewayRoute.update({
        where: { id },
        data: {
          name,
          routePath,
          targetUrl,
          checkPort: portNumber,
          isActive,
        },
      });

      res.json(route);
    } catch (error) {
      console.error('Error updating gateway route:', error);
      res.status(500).json({ message: 'Erro ao atualizar rota' });
    }
  },

  /**
   * Remove uma rota
   */
  async deleteRoute(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await prisma.gatewayRoute.delete({ where: { id } });
      res.json({ message: 'Rota removida com sucesso' });
    } catch (error) {
      console.error('Error deleting gateway route:', error);
      res.status(500).json({ message: 'Erro ao remover rota' });
    }
  },

  /**
   * Retorna estatísticas simplificadas para o Dashboard
   */
  async getStats(req: Request, res: Response) {
    try {
      const [totalCount, activeCount, usedPortsCount] = await Promise.all([
        prisma.gatewayRoute.count(),
        prisma.gatewayRoute.count({ where: { isActive: true } }),
        prisma.gatewayRoute.count({ where: { checkPort: { gt: 0 } } }),
      ]);

      let availablePortsCount = 0;
      try {
        const redis = await getRedisClient();
        const lastScan = await redis.get('gateway:last_scan_result');
        availablePortsCount = lastScan ? parseInt(lastScan, 10) : 0;
      } catch (err) {
        console.error('Redis error in getStats:', err);
      }

      res.json({
        totalGateways: totalCount,
        activeGateways: activeCount,
        usedPorts: usedPortsCount,
        availablePorts: availablePortsCount,
      });
    } catch (error) {
      console.error('Error fetching gateway stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas' });
    }
  },

  /**
   * Descoberta automática de serviços (Port Scan)
   */
  async discoverPorts(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 5000;
      
      // Get currently registered ports to exclude them
      const registeredRoutes = await prisma.gatewayRoute.findMany({
        select: { checkPort: true }
      });
      const registeredPorts = registeredRoutes.map(r => r.checkPort);
      
      const activePorts = await discoverAvailablePorts(limit, registeredPorts);

      res.json({ 
        host: env.PORT_CHECK_HOST, 
        activePorts 
      });
    } catch (error) {
      console.error('Error discovering ports:', error);
      res.status(500).json({ message: 'Erro ao escanear portas' });
    }
  }
};
