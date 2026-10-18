import { z } from "zod";

const ServerSchema = z.strictObject({
  port: z
    .number()
    .int("必须是整数")
    .min(1024, "必须大于等于 1024")
    .max(65535, "必须小于等于 65535")
    .default(3210),
});

const BrowserSchema = z.strictObject({
  executablePath: z
    .string()
    .refine((value) => value.trim().length > 0, "不能为空字符串")
    .optional(),
});

const ScheduleSchema = z.strictObject({
  dataPullAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "必须是 24 小时制 HH:mm 时间")
    .default("06:00"),
});

const LeaseSchema = z.strictObject({
  minutes: z
    .number()
    .int("必须是整数")
    .min(5, "必须大于等于 5")
    .max(1440, "必须小于等于 1440")
    .default(120),
});

const IdeasSchema = z.strictObject({
  devRoots: z
    .array(
      z.string().refine((value) => value.trim().length > 0, "不能为空字符串"),
    )
    .optional(),
});

export const ConfigSchema = z.strictObject({
  version: z.literal(2, { error: "必须是 2" }),
  server: ServerSchema.default({ port: 3210 }),
  browser: BrowserSchema.default({}),
  schedule: ScheduleSchema.default({ dataPullAt: "06:00" }),
  lease: LeaseSchema.default({ minutes: 120 }),
  ideas: IdeasSchema.default({}),
});

export type LeafPressConfig = z.output<typeof ConfigSchema>;

export const DEFAULT_CONFIG: LeafPressConfig = ConfigSchema.parse({
  version: 2,
});
