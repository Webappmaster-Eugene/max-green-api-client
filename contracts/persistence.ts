import { z } from "zod";
import { maxConnectSchema, maxProfileSchema } from "./max.js";
export const savedConnectionSchema = z
  .object({
    owner: z.number().int().positive().safe(),
    profile: maxProfileSchema,
    credentials: maxConnectSchema.optional(),
    connectionId: z.string().uuid(),
  })
  .strict();
export const connectionStoreSchema = z
  .object({
    version: z.literal(1),
    connections: z.array(savedConnectionSchema).max(10000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.connections.map((c) => c.owner)).size !==
      value.connections.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate connection owner" });
    const active = value.connections.filter((c) => c.credentials);
    if (new Set(active.map((c) => c.profile.idInstance)).size !== active.length)
      ctx.addIssue({ code: "custom", message: "Duplicate active instance" });
    for (const c of active) {
      if (
        c.profile.idInstance !== c.credentials?.idInstance ||
        c.profile.apiUrl !== c.credentials.apiUrl ||
        c.profile.mediaUrl !== c.credentials.mediaUrl
      )
        ctx.addIssue({ code: "custom", message: "Invalid saved profile" });
    }
  });
