import type { NextFunction, Request, Response } from 'express';
import { resolveSession, tokenFromCookies } from './session';

export interface AuthContext {
  userId: number;
  academyId: number;
}

/**
 * Exige sessão válida; anexa `{ userId, academyId }` em `res.locals.auth`.
 * Toda query de dados deve filtrar por esse academyId — nunca confie em ids
 * vindos do cliente sem checar o academy_id.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = tokenFromCookies(req.cookies);
  const user = token ? resolveSession(token) : null;
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  res.locals.auth = { userId: user.id, academyId: user.academyId } satisfies AuthContext;
  next();
}

/** Contexto anexado por requireAuth (use apenas em rotas protegidas). */
export function getAuth(res: Response): AuthContext {
  return res.locals.auth as AuthContext;
}
