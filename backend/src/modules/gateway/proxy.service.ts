import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { prisma } from '../../config/database';

/**
 * Dinamic Proxy Middleware
 * Intercepta requisições e as encaminha para o destino correto com base no path.
 */
export const dynamicProxy = async (req: Request, res: Response, next: NextFunction) => {
  // Ignora rotas da própria API e Webhooks
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path === '/health') {
    return next();
  }

  try {
    // Busca todas as rotas ativas
    const routes = await prisma.gatewayRoute.findMany({
      where: { isActive: true },
    });

    // Encontra a rota que mais se aproxima do path atual
    const matchedRoute = routes.find((r: any) => req.path.startsWith(r.routePath));

    if (!matchedRoute) {
      return next(); // Segue para o próximo middleware ou 404
    }

    // Configuração do Proxy
    const proxyOptions: Options = {
      target: matchedRoute.targetUrl,
      changeOrigin: true,
      pathRewrite: {
        [`^${matchedRoute.routePath}`]: '', // Remove o prefixo da rota ao encaminhar
      },
      on: {
        error: (err: Error, req: any, res: any) => {
          console.error(`Proxy Error (${matchedRoute.name}):`, err);
          (res as Response).status(502).send('Bad Gateway - O serviço de destino não está respondendo.');
        },
      },
    };

    // Cria e executa o proxy para esta requisição
    const proxy = createProxyMiddleware(proxyOptions);
    return proxy(req, res, next);

  } catch (error) {
    console.error('Dynamic Proxy Error:', error);
    next(error);
  }
};
