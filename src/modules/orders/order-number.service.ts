import { randomInt } from "node:crypto";
import { ORDER_NUMBER } from "../../config/constants.js";

export function generateOrderNumber(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const random = String(randomInt(0, 10 ** ORDER_NUMBER.RANDOM_LENGTH)).padStart(
    ORDER_NUMBER.RANDOM_LENGTH,
    "0",
  );
  return `${ORDER_NUMBER.PREFIX}${yyyy}${mm}${dd}${random}`;
}