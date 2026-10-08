import type { CodeStepHandler } from "../types.js";
import { archiveLink } from "./archive.js";

export const GENERAL_HANDLERS: Record<string, CodeStepHandler> = {
  "general-write/archive": archiveLink,
};
