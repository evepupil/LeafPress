import type { UseCases } from "@leafpress/core";
import type { AppContext } from "./context.js";
import { createAccountsUseCases } from "./accounts.js";
import { createDataUseCases } from "./data.js";
import { createIdeasGatherUseCases } from "./ideas-gather.js";
import { createIdeasUseCases } from "./ideas.js";
import { createImportUseCases } from "./import.js";
import { createNotesUseCases } from "./notes.js";
import { createSystemUseCases } from "./system.js";
import { createWorksAgentStepUseCases } from "./works-agent-step.js";
import { createWorksAgentUseCases } from "./works-agent.js";
import { createWorksCreateUseCases } from "./works-create.js";
import { createWorksEditUseCases } from "./works-edit.js";
import { createWorksReadUseCases } from "./works-read.js";

export function createUseCases(app: AppContext): UseCases {
  return {
    ...createWorksReadUseCases(app),
    ...createWorksCreateUseCases(app),
    ...createWorksEditUseCases(app),
    ...createWorksAgentUseCases(app),
    ...createWorksAgentStepUseCases(app),
    ...createIdeasUseCases(app),
    ...createIdeasGatherUseCases(app),
    ...createImportUseCases(app),
    ...createAccountsUseCases(app),
    ...createDataUseCases(app),
    ...createNotesUseCases(app),
    ...createSystemUseCases(app),
  };
}
