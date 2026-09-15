declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        email: string;
        roles: string[];
        permissions: string[];
      };
    }
  }
}

export {};