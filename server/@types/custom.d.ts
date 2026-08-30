import { Request } from "express";

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  avatar?: { public_id: string; url: string } | null;
  role: string;
  isVerified: boolean;
  courses: any[];
  stripeCustomerId?: string | null;
  blueskyDid?: string | null;
  blueskyHandle?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
