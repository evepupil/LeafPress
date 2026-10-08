import { LeafPressError } from "../../shared/errors.js";

export type DoctorLevel = "ok" | "warn" | "error";

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly level: DoctorLevel;
  readonly detail: string;
  readonly hint?: string;
}

export interface DoctorResult {
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorDependencies {
  readonly nodeVersion?: string;
  readonly repoRoot?: string;
  readonly edgeLocator?: (configuredPath?: string) => string | undefined;
  readonly canWriteDirectory?: (directory: string) => boolean;
}

export function doctorCheck(
  id: string,
  label: string,
  level: DoctorLevel,
  detail: string,
  hint?: string,
): DoctorCheck {
  return { id, label, level, detail, ...(hint === undefined ? {} : { hint }) };
}

export function describeDoctorError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function safeCheck(
  id: string,
  label: string,
  run: () => DoctorCheck | Promise<DoctorCheck>,
  failureLevel: DoctorLevel = "warn",
  hint?: string,
): Promise<DoctorCheck> {
  try {
    return await run();
  } catch (error) {
    return doctorCheck(
      id,
      label,
      failureLevel,
      `检查失败：${describeDoctorError(error)}`,
      hint,
    );
  }
}

export function configFailure(error: unknown): DoctorCheck {
  if (error instanceof LeafPressError)
    return doctorCheck("config", "配置", "error", error.message, error.hint);
  return doctorCheck("config", "配置", "error", describeDoctorError(error));
}
