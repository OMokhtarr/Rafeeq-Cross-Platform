/**
 * Ties the catalog to the pages: every step has a data-tour target somewhere,
 * every tour is requested by some page, and no page uses a ref or id the
 * catalog doesn't know (a typo would otherwise just skip the step silently).
 */
import * as fs from "fs";
import * as path from "path";
import { TOURS, TourId } from "../tourCatalog";

const APP_DIR = path.resolve(__dirname, "../../..");
const SKIP_DIR = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return full === SKIP_DIR || e.name === "__tests__" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const ids = Object.keys(TOURS) as TourId[];
const refs = new Set(ids.flatMap((id) => TOURS[id].map((s) => `${id}.${s.key}`)));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idPattern = [...ids].sort((a, b) => b.length - a.length).map(escape).join("|");
const DOTTED = new RegExp(`"((?:${idPattern})(?:\\.[A-Za-z]+)+)"`, "g");
const PAGE_TOUR = /usePageTour\(\s*\[([^\]]*)\]/g;

const sources = sourceFiles(APP_DIR).map((f) => fs.readFileSync(f, "utf8"));
const literals = new Set(sources.flatMap((src) => [...src.matchAll(DOTTED)].map((m) => m[1])));
const requested = new Set(
  sources.flatMap((src) => [...src.matchAll(PAGE_TOUR)].flatMap((m) => [...m[1].matchAll(/"([A-Za-z.]+)"/g)].map((x) => x[1]))),
);

it("uses only known tour refs and ids", () => {
  const unknown = [...literals].filter((l) => !refs.has(l) && !ids.includes(l as TourId));
  expect(unknown).toEqual([]);
});

it("gives every catalog step a target", () => {
  expect([...refs].filter((r) => !literals.has(r))).toEqual([]);
});

it("requests every tour from some page, and only known tours", () => {
  expect(ids.filter((id) => !requested.has(id))).toEqual([]);
  expect([...requested].filter((id) => !ids.includes(id as TourId))).toEqual([]);
});
