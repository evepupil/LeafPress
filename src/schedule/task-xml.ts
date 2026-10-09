import { LeafPressError } from "../shared/errors.js";

export interface TaskXmlInput {
  at: string;
  now: Date;
  userId: string;
  wrapperPath: string;
  workingDirectory: string;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validateTime(at: string): void {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(at)) {
    throw new LeafPressError("USAGE", "计划时间必须是 HH:mm 格式。");
  }
}

function nextBoundary(now: Date, at: string): Date {
  const [hours, minutes] = at.split(":").map(Number);
  const boundary = new Date(now);
  boundary.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  if (boundary.getTime() <= now.getTime())
    boundary.setDate(boundary.getDate() + 1);
  return boundary;
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

export function buildTaskXml(input: TaskXmlInput): string {
  validateTime(input.at);
  if (Number.isNaN(input.now.getTime()))
    throw new LeafPressError("USAGE", "计划任务日期无效。");

  const boundaryDate = nextBoundary(input.now, input.at);
  const boundary = `${formatLocalDate(boundaryDate)}T${input.at}:00`;
  const argumentsText = `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${input.wrapperPath}"`;

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>LeafPress 每天拉作品数据（数据目录：${xmlEscape(input.workingDirectory)}）</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${xmlEscape(boundary)}</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(input.userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT30M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>${xmlEscape(argumentsText)}</Arguments>
      <WorkingDirectory>${xmlEscape(input.workingDirectory)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}
