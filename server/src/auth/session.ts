import { randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { SessionUser } from '@gymvis/shared';
import { db } from '../db/client';
import { MS_PER_DAY } from '../lib/dates';

/** Sessão rudimentar via cookie httpOnly — protótipo local, sem `secure`. */

export const SESSION_COOKIE = 'gymvis_session';
export const SESSION_TTL_MS = 30 * MS_PER_DAY;

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_MS,
};

const INSERIR = 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)';
const APAGAR = 'DELETE FROM sessions WHERE token = ?';
const RESOLVER = `
  SELECT s.expires_at, u.id AS user_id, u.nome, u.email, u.academy_id, a.nome AS academy_nome
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  JOIN academies a ON a.id = u.academy_id
  WHERE s.token = ?
`;

interface ResolvedSessionRow {
  expires_at: number;
  user_id: number;
  nome: string;
  email: string;
  academy_id: number;
  academy_nome: string;
}

const LIMPAR_VENCIDAS = 'DELETE FROM sessions WHERE expires_at <= ?';

/** Remove sessões vencidas; sem isso a tabela só cresce. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.run(LIMPAR_VENCIDAS, Date.now());
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  await purgeExpiredSessions();
  await db.run(INSERIR, token, userId, now, now + SESSION_TTL_MS);
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await db.run(APAGAR, token);
}

/** Resolve o token para o usuário da sessão; sessão expirada é apagada. */
export async function resolveSession(token: string): Promise<SessionUser | null> {
  const row = await db.one<ResolvedSessionRow>(RESOLVER, token);
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await db.run(APAGAR, token);
    return null;
  }
  return {
    id: row.user_id,
    nome: row.nome,
    email: row.email,
    academyId: row.academy_id,
    academyNome: row.academy_nome,
  };
}

/** Token do cookie, quando presente e bem-formado. */
export function tokenFromCookies(cookies: unknown): string | null {
  if (typeof cookies !== 'object' || cookies === null) return null;
  const token = (cookies as Record<string, unknown>)[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
}
