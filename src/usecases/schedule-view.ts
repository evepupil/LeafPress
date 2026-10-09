import type { BootstrapScheduleView } from "@leafpress/core";
import { readScheduleState } from "../schedule/state.js";
import type { AppContext } from "./context.js";

/**
 * 「拉作品数据」这个定时任务现在的样子，给网页和账号接入用。
 * 只读计划任务的状态文件，不去问系统：网页每次取数据都要用，问一次 PowerShell 太慢；
 * 准确的状态由 `leafpress schedule status` 和体检去查。
 * 状态文件不存在或损坏时按「没装」算，时间用配置里的默认值。
 */
export function dataPullScheduleView(app: AppContext): BootstrapScheduleView {
  const state = readScheduleState(
    app.paths,
    app.config.schedule.dataPullAt,
  ).dataPull;
  return {
    id: "data-pull",
    name: "拉作品数据",
    summary: "每天拉一次各账号的数据；拿数据的工具还没做的平台跳过。",
    when: `每天 ${state.at}`,
    installed: state.installed,
    ...(state.installedAt === undefined
      ? {}
      : { installedAt: state.installedAt }),
    ...(state.lastRunAt === undefined ? {} : { lastRunAt: state.lastRunAt }),
    ...(state.lastResult === undefined ? {} : { lastResult: state.lastResult }),
    ...(state.lastNote === undefined ? {} : { lastNote: state.lastNote }),
  };
}

/** 账号接入里数据获取的「什么时候拉」：装了写「每天 06:00」，没装不写 */
export function dataPullWhen(app: AppContext): string | undefined {
  const view = dataPullScheduleView(app);
  return view.installed ? view.when : undefined;
}
