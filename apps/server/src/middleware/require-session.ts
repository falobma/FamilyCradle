import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";
import type { createAuth } from "../auth.js";

type Auth = ReturnType<typeof createAuth>;

export function requireSession(auth: Auth): RequestHandler {
  return async (request, response, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        response.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required.",
          },
        });
        return;
      }

      response.locals.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}
