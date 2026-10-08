import type {
  AddAccountInput,
  AddIdeaInput,
  CreateWorksInput,
  FeedbackInput,
  MoveIdeaInput,
  MoveWorkInput,
  PullInput,
  SaveNoteInput,
  SaveProfileInput,
  SetSettingInput,
  UpdateAccountInput,
  UpdateIdeaInput,
  UpdateWorkInput,
} from "@leafpress/core";
import { z } from "zod";

const idSchema = z.string();

export const CreateWorksSchema = z.strictObject({
  source: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("idea"), ideaId: idSchema }),
    z.strictObject({ kind: z.literal("work"), workId: idSchema }),
    z.strictObject({ kind: z.literal("new"), title: z.string() }),
  ]),
  accountIds: z.array(idSchema),
  brief: z.string(),
});

export const UpdateWorkSchema = z.strictObject({
  title: z.string().optional(),
  brief: z.string().optional(),
  workflowId: z.string().optional(),
  url: z.string().nullable().optional(),
  question: z.string().nullable().optional(),
});

export const MoveWorkSchema = z.strictObject({
  status: z.enum(["todo", "waiting", "done"]),
  beforeId: z.string().nullable(),
});

export const FeedbackSchema = z.strictObject({ text: z.string() });

export const AddIdeaSchema = z.strictObject({
  text: z.string(),
  detail: z.string().optional(),
  accountId: z.string().optional(),
  source: z.enum([
    "quick",
    "devlog",
    "cloudmind",
    "trend",
    "bookmark",
    "batch",
    "schedule",
  ]),
  sourceDetail: z.string().optional(),
});

export const UpdateIdeaSchema = z.strictObject({
  text: z.string().optional(),
  detail: z.string().optional(),
  accountId: z.string().nullable().optional(),
});

export const MoveIdeaSchema = z.strictObject({
  status: z.enum(["inbox", "promising"]),
  beforeId: z.string().nullable(),
});

export const AddAccountSchema = z.strictObject({
  platform: z.enum(["blog", "zhihu", "bilibili", "xiaohongshu"]),
  name: z.string(),
  intro: z.string(),
  handle: z.string().optional(),
  url: z.string().optional(),
  settings: z.record(z.string(), z.string()).optional(),
});

export const UpdateAccountSchema = z.strictObject({
  name: z.string().optional(),
  handle: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  stage: z.enum(["active", "preparing", "paused"]).optional(),
});

export const SaveProfileSchema = z.strictObject({ profile: z.string() });
export const SetSettingSchema = z.strictObject({ value: z.string() });
export const PullSchema = z.strictObject({
  accountIds: z.array(z.string()).optional(),
});
export const SaveNoteSchema = z.strictObject({
  wins: z.string(),
  improve: z.string(),
  next: z.string(),
});

export type RequestSchemaTypes = [
  [z.infer<typeof CreateWorksSchema>, CreateWorksInput],
  [z.infer<typeof UpdateWorkSchema>, UpdateWorkInput],
  [z.infer<typeof MoveWorkSchema>, MoveWorkInput],
  [z.infer<typeof FeedbackSchema>, FeedbackInput],
  [z.infer<typeof AddIdeaSchema>, AddIdeaInput],
  [z.infer<typeof UpdateIdeaSchema>, UpdateIdeaInput],
  [z.infer<typeof MoveIdeaSchema>, MoveIdeaInput],
  [z.infer<typeof AddAccountSchema>, AddAccountInput],
  [z.infer<typeof UpdateAccountSchema>, UpdateAccountInput],
  [z.infer<typeof SaveProfileSchema>, SaveProfileInput],
  [z.infer<typeof SetSettingSchema>, SetSettingInput],
  [z.infer<typeof PullSchema>, PullInput],
  [z.infer<typeof SaveNoteSchema>, SaveNoteInput],
];
