import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * O Express 4 não captura rejeições de handlers async: sem este wrapper, um
 * erro no banco deixa a requisição pendurada até o timeout do navegador, sem
 * resposta e sem log. Toda rota assíncrona precisa passar por aqui.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
