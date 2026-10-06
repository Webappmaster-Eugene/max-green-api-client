import type { z } from "zod";
import type {
  connectionStoreSchema,
  savedConnectionSchema,
} from "../contracts/persistence.js";
export type SavedConnection = z.infer<typeof savedConnectionSchema>;
export type ConnectionStore = z.infer<typeof connectionStoreSchema>;
