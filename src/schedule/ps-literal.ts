/**
 * 把任意字符串写成 PowerShell 的单引号字面量，启动脚本和查询脚本共用。
 *
 * 原理：PowerShell 的分词器认五种单引号：ASCII 的 ' 和四个弯单引号
 * U+2018、U+2019、U+201A、U+201B（样子是 ‘ ’ ‚ ‛）。
 * 单引号字符串里，任何一种单引号字符连写两个才表示一个字符本身。
 * 只把 ' 加倍的话，路径里有中文输入法打出的 ’ 就会提前结束字符串，脚本语法错误。
 * 所以这五种字符各自写两遍。
 */
const SINGLE_QUOTE_CODE_POINTS = [0x27, 0x2018, 0x2019, 0x201a, 0x201b];

const SINGLE_QUOTE_CHARS = new RegExp(
  `[${SINGLE_QUOTE_CODE_POINTS.map((code) => String.fromCodePoint(code)).join("")}]`,
  "gu",
);

export function psLiteral(value: string): string {
  return `'${value.replace(SINGLE_QUOTE_CHARS, "$&$&")}'`;
}
