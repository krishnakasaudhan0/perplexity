import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "./db";

// Augment the Express Request interface globally
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: SupabaseUser;
      userRecord?: any;
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Warning: Supabase credentials are not fully configured in backend environment variables.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid token format" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token missing" });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // Auto-sync Supabase User with local Postgres Database
    let localUser = await prisma.user.findFirst({
      where: { supabaseId: user.id },
    });

    if (!localUser) {
      // Fallback: search by email to link existing records
      localUser = await prisma.user.findUnique({
        where: { email: user.email! },
      });

      if (localUser) {
        // Update existing record with the new Supabase ID
        localUser = await prisma.user.update({
          where: { id: localUser.id },
          data: { supabaseId: user.id },
        });
      } else {
        // Create new local user record
        let provider: "Github" | "Google" = "Github";
        const rawProvider = user.app_metadata?.provider || user.identities?.[0]?.provider;
        if (rawProvider && rawProvider.toLowerCase() === "google") {
          provider = "Google";
        }

        localUser = await prisma.user.create({
          data: {
            supabaseId: user.id,
            email: user.email!,
            name: user.user_metadata?.full_name || user.user_metadata?.name || user.email!.split("@")[0] || "User",
            provider: provider,
          },
        });
      }
    }

    req.user = user;
    req.userId = user.id;
    req.userRecord = localUser;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Internal server error during authentication" });
  }
}