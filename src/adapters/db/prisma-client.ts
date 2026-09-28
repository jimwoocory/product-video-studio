import { PrismaClient } from "@prisma/client";

declare global {
  var __pvsPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__pvsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalThis.__pvsPrisma = prisma;
