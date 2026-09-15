export interface AppAuth {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AppAuth;
      version?: number;
    }
  }
}

export {};