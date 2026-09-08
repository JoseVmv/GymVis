import type { Response, Router } from 'express';
import { z } from 'zod';
import type { AuthResponse } from '@gymvis/shared';
import { db } from '../db/client';
import { asyncHandler } from '../http/asyncHandler';
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
 * Rotas de autenticação. Tudo que toca o banco é assíncrono, então cada
 * handler passa pelo asyncHandler para que erros cheguem ao tratador central.
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

const BUSCAR_POR_EMAIL = `
  SELECT u.id, u.nome, u.email, u.password_hash, u.academy_id, a.nome AS academy_nome
  FROM users u
  JOIN academies a ON a.id = u.academy_id
  WHERE u.email = ?
`;
const INSERIR_ACADEMIA = 'INSERT INTO academies (nome, created_at) VALUES (?, ?) RETURNING id';
const INSERIR_USUARIO =
  'INSERT INTO users (academy_id, nome, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id';

/**
 * Cada conta nasce com a sua própria academia: é o que garante que uma
 * academia nunca enxergue os dados de outra. Academia e usuário são criados
 * na mesma transação — uma academia órfã deixaria o cadastro pela metade.
 */
function createAccount(
  nome: string,
  academiaNome: string,
  email: string,
  passwordHash: string,
): Promise<{ academyId: number; userId: number }> {
  return db.transaction(async (tx) => {
    const now = Date.now();
    const academia = await tx.one<{ id: number }>(INSERIR_ACADEMIA, academiaNome, now);
    const academyId = academia!.id;
    const usuario = await tx.one<{ id: number }>(
      INSERIR_USUARIO,
      academyId,
      nome,
      email,
      passwordHash,
      now,
    );
    return { academyId, userId: usuario!.id };
  });
}

/** 23505 = unique_violation no Postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505'
  );
}

async function issueSession(res: Response, userId: number): Promise<void> {
  const token = await createSession(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

const MINUTE = 60_000;
const loginLimit = createRateLimit(10, 15 * MINUTE);
const registerLimit = createRateLimit(5, 60 * MINUTE);

const clientKey = (req: { ip?: string }): string => req.ip ?? 'desconhecido';

export function registerAuthRoutes(api: Router): void {
  api.post('/auth/register', asyncHandler(async (req, res) => {
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

    if (await db.one(BUSCAR_POR_EMAIL, email)) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado' });
      return;
    }

    let ids: { academyId: number; userId: number };
    try {
      ids = await createAccount(nome, academiaNome, email, hashPassword(senha));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: 'Este e-mail já está cadastrado' });
        return;
      }
      throw err;
    }

    await issueSession(res, ids.userId);
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
  }));

  api.post('/auth/login', asyncHandler(async (req, res) => {
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

    const user = await db.one<UserRow>(BUSCAR_POR_EMAIL, email);
    if (!user || !verifyPassword(senha, user.password_hash)) {
      res.status(401).json({ error: 'E-mail ou senha incorretos' });
      return;
    }

    loginLimit.clear(key);
    await issueSession(res, user.id);
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
  }));

  api.post('/auth/logout', asyncHandler(async (req, res) => {
    const token = tokenFromCookies(req.cookies);
    if (token) await deleteSession(token);
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  }));

  api.get('/auth/me', asyncHandler(async (req, res) => {
    const token = tokenFromCookies(req.cookies);
    const user = token ? await resolveSession(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const body: AuthResponse = { user };
    res.json(body);
  }));
}
