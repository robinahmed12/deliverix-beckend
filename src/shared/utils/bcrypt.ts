import argon2 from "argon2";
import { env } from "../../config/env.js";

const options = {
  memoryCost: env.ARGON2_MEMORY_KIB,
  timeCost: env.ARGON2_TIME,
  parallelism: env.ARGON2_PARALLELISM,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}