import { describe, expect, it } from "vitest";

import {
  AddIdeaSchema,
  CreateWorksSchema,
  type RequestSchemaTypes,
} from "../../src/server/schemas.js";

type Checks<Pair> = Pair extends readonly [infer SchemaType, infer ApiType]
  ? [SchemaType] extends [ApiType]
    ? [ApiType] extends [SchemaType]
      ? true
      : false
    : false
  : false;
type EverySchemaMatchesApi =
  false extends Checks<RequestSchemaTypes[number]> ? false : true;
const schemaTypesAreBidirectional: EverySchemaMatchesApi = true;
void schemaTypesAreBidirectional;

describe("请求 schema", () => {
  it("拒绝额外字段", () => {
    expect(
      AddIdeaSchema.safeParse({ text: "灵感", source: "quick", extra: true })
        .success,
    ).toBe(false);
    expect(
      CreateWorksSchema.safeParse({
        source: { kind: "new", title: "标题" },
        accountIds: [],
        brief: "",
        extra: 1,
      }).success,
    ).toBe(false);
  });
});
