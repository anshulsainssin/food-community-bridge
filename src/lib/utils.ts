import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Readable message from a thrown server-function error (or anything else that was thrown). */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
