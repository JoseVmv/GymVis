import { randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { SessionUser } from '@gymvis/shared';
import { sqlite } from '../db/client';
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

const insertSessionStmt = sqlite.prepare(
  'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
);
const deleteSessionStmt = sqlite.prepare('DELETE FROM sessions WHERE token = ?');
const resolveSessionStmt = sqlite.prepare(`
  SELECT s.expires_at, u.id AS user_id, u.nome, u.email, u.academy_id, a.nome AS academy_nome
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  JOIN academies a ON a.id = u.academy_id
  WHERE s.token = ?
`);

interface ResolvedSessionRow {
  expires_at: number;
  user_id: number;
  nome: string;
  email: string;
  academy_id: number;
  academy_nome: string;
}

const purgeExpiredStmt = sqlite.prepare('DELETE FROM sessions WHERE expires_at <= ?');

/** Remove sessões vencidas; sem isso a tabela só cresce. */
export function purgeExpiredSessions(): void {
  purgeExpiredStmt.run(Date.now());
}

purgeExpiredSessions();

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  purgeExpiredSessions();
  insertSessionStmt.run(token, userId, now, now + SESSION_TTL_MS);
  return token;
}

export function deleteSession(token: string): void {
  deleteSessionStmt.run(token);
}

/** Resolve o token para o usuário da sessão; sessão expirada é apagada. */
export function resolveSession(token: string): SessionUser | null {
  const row = resolveSessionStmt.get(token) as ResolvedSessionRow | undefined;
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    deleteSessionStmt.run(token);
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
