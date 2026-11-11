import { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 does not catch errors of async handlers: without this, a database failure would crash the server. */
export const handle =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
