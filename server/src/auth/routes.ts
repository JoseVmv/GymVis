import type { Response, Router } from 'express';
import { z } from 'zod';
import type { AuthResponse } from '@gymvis/shared';
import { sqlite } from '../db/client';
import { hashPassword, verifyPassword } from './password';
import { createRateLimit } from './rateLimit';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  resolveSession,
  sessionCookieOptions,
  tokenFromCookies,
} from './session';

/**
 * Rotas de autenticação. Handlers são todos síncronos (better-sqlite3 e
 * scrypt são síncronos), então o Express 4 captura exceções normalmente.
 */

const registerSchema = z.object({
  nome: z
    .string({ required_error: 'Informe seu nome', invalid_type_error: 'Informe seu nome' })
    .trim()
    .min(1, 'Informe seu nome'),
  academiaNome: z
    .string({
      required_error: 'Informe o nome da academia',
      invalid_type_error: 'Informe o nome da academia',
    })
    .trim()
    .min(1, 'Informe o nome da academia'),
  email: z
    .string({ required_error: 'Informe o e-mail', invalid_type_error: 'Informe o e-mail' })
    .trim()
    .toLowerCase()
    .email('E-mail inválido'),
  senha: z
    .string({ required_error: 'Informe a senha', invalid_type_error: 'Informe a senha' })
    .min(8, 'A senha deve ter pelo menos 8 caracteres'),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Informe o e-mail', invalid_type_error: 'Informe o e-mail' })
    .trim()
    .toLowerCase()
    .min(1, 'Informe o e-mail'),
  senha: z
    .string({ required_error: 'Informe a senha', invalid_type_error: 'Informe a senha' })
    .min(1, 'Informe a senha'),
});

interface UserRow {
  id: number;
  nome: string;
  email: string;
  password_hash: string;
  academy_id: number;
  academy_nome: string;
}

const findUserByEmailStmt = sqlite.prepare(`
  SELECT u.id, u.nome, u.email, u.password_hash, u.academy_id, a.nome AS academy_nome
  FROM users u
  JOIN academies a ON a.id = u.academy_id
  WHERE u.email = ?
`);
const insertAcademyStmt = sqlite.prepare('INSERT INTO academies (nome, created_at) VALUES (?, ?)');
const insertUserStmt = sqlite.prepare(
  'INSERT INTO users (academy_id, nome, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
);

const createAccountTx = sqlite.transaction(
  (nome: string, academiaNome: string, email: string, passwordHash: string) => {
    const now = Date.now();
    const academyId = Number(insertAcademyStmt.run(academiaNome, now).lastInsertRowid);
    const userId = Number(
      insertUserStmt.run(academyId, nome, email, passwordHash, now).lastInsertRowid,
    );
    return { academyId, userId };
  },
);

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof err.code === 'string' &&
    err.code.startsWith('SQLITE_CONSTRAINT')
  );
}

function issueSession(res: Response, userId: number): void {
  const token = createSession(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

const MINUTE = 60_000;
const loginLimit = createRateLimit(10, 15 * MINUTE);
const registerLimit = createRateLimit(5, 60 * MINUTE);

const clientKey = (req: { ip?: string }): string => req.ip ?? 'desconhecido';

export function registerAuthRoutes(api: Router): void {
  api.post('/auth/register', (req, res) => {
    if (!registerLimit.attempt(clientKey(req))) {
      res.status(429).json({ error: 'Muitas contas criadas. Tente novamente mais tarde.' });
      return;
    }
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const { nome, academiaNome, email, senha } = parsed.data;

    if (findUserByEmailStmt.get(email)) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado' });
      return;
    }

    let ids: { academyId: number; userId: number };
    try {
      ids = createAccountTx(nome, academiaNome, email, hashPassword(senha));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: 'Este e-mail já está cadastrado' });
        return;
      }
      throw err;
    }

    issueSession(res, ids.userId);
    const body: AuthResponse = {
      user: {
        id: ids.userId,
        nome,
        email,
        academyId: ids.academyId,
        academyNome: academiaNome,
      },
    };
    res.json(body);
  });

  api.post('/auth/login', (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const { email, senha } = parsed.data;

    // A chave inclui o e-mail: tentativas contra uma conta não podem trancar
    // as outras do mesmo endereço (academias atrás de um NAT compartilhado).
    const key = `${clientKey(req)}|${email}`;
    if (!loginLimit.attempt(key)) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
      return;
    }

    const user = findUserByEmailStmt.get(email) as UserRow | undefined;
    if (!user || !verifyPassword(senha, user.password_hash)) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    loginLimit.clear(key);
    issueSession(res, user.id);
    const body: AuthResponse = {
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        academyId: user.academy_id,
        academyNome: user.academy_nome,
      },
    };
    res.json(body);
  });

  api.post('/auth/logout', (req, res) => {
    const token = tokenFromCookies(req.cookies);
    if (token) deleteSession(token);
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => {
    const token = tokenFromCookies(req.cookies);
    const user = token ? resolveSession(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const body: AuthResponse = { user };
    res.json(body);
  });
}
