import argon2 from "argon2";

export function generateInitialPassword(name: string, ic: string): string {
  const prefix = name.trim().slice(0, 2).toLowerCase();
  const suffix = ic.replace(/\D/g, "").slice(0, 6);
  return prefix + suffix;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
