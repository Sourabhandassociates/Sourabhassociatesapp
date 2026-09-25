import { AuthorizedActor } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      actor?: AuthorizedActor;
    }
  }
}

export {};
