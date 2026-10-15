import type { CardTheme } from "./types.js";

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif';

export const THEME_PAPER: CardTheme = {
  width: 1080,
  height: 1440,
  safe: 96,
  background: "#F5F2EA",
  text: "#343A35",
  accent: "#386B54",
  muted: "#737A73",
  fontFamily: FONT_FAMILY,
  coverTitle: 72,
  pointTitle: 56,
  body: 36,
  lineHeight: 1.65,
  pageNumber: 24,
};

export const THEME_BOLD: CardTheme = {
  width: 1080,
  height: 1440,
  safe: 88,
  background: "#FFFFFF",
  text: "#171717",
  accent: "#FF2442",
  muted: "#686868",
  fontFamily: FONT_FAMILY,
  coverTitle: 92,
  pointTitle: 68,
  body: 44,
  lineHeight: 1.5,
  pageNumber: 28,
};

export const THEME_DARK: CardTheme = {
  width: 1080,
  height: 1440,
  safe: 96,
  background: "#1B252E",
  text: "#EAF0F2",
  accent: "#48D8E5",
  muted: "#A5B4BC",
  fontFamily: FONT_FAMILY,
  coverTitle: 76,
  pointTitle: 60,
  body: 38,
  lineHeight: 1.6,
  pageNumber: 26,
};
