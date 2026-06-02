import { z } from "zod";

export const postChannelMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export type PostChannelMessage = z.infer<typeof postChannelMessageSchema>;
