import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { aquecerConexoes } from './db/client';
import { registerRoutes } from './http/routes';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());

registerRoutes(app);

// Em produção o servidor também entrega o build do cliente (SPA).
const clientDist = path.resolve(here, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, async () => {
  console.log(`GymVis API em http://localhost:${port}`);
  try {
    const t0 = Date.now();
    await aquecerConexoes();
    console.log(`Conexões com o banco prontas em ${Date.now() - t0} ms`);
  } catch (err) {
    console.error('Falha ao conectar no banco:', err);
  }
});
