import {
  clearQuizSession,
  loadQuizSession,
  peekQuizSession,
  resetQuizSessionCacheForTests,
  saveQuizSession,
} from "../quiz-session";

const META_KEY = "rafeeq_quiz_session_v1";
const QUESTIONS_KEY = "rafeeq_quiz_session_questions_v1";

const questions = [{ id: "1:1" }, { id: "2:255" }, { id: "112:1" }];

beforeEach(() => {
  localStorage.clear();
  resetQuizSessionCacheForTests();
});

test("a saved session restores its questions and progress", () => {
  saveQuizSession("akmel-alayah", questions, { idx: 1, score: 1, userAnswer: "الله" });
  resetQuizSessionCacheForTests(); // as after an app restart

  expect(loadQuizSession("akmel-alayah")).toEqual({
    questions,
    progress: { idx: 1, score: 1, userAnswer: "الله" },
  });
});

test("another quiz does not pick up the session", () => {
  saveQuizSession("akmel-alayah", questions, { idx: 0 });

  expect(loadQuizSession("mutashabihat")).toBeNull();
});

test("peek reports the quiz route and position", () => {
  saveQuizSession("mutashabihat", questions, { idx: 2 });

  expect(peekQuizSession()).toEqual({
    kind: "mutashabihat",
    route: "/mutashabihat-test",
    idx: 2,
    total: 3,
  });
});

test("clearing ends the session", () => {
  saveQuizSession("akmel-alnehayat", questions, { idx: 0 });
  clearQuizSession();

  expect(peekQuizSession()).toBeNull();
  expect(loadQuizSession("akmel-alnehayat")).toBeNull();
});

test("progress saves do not rewrite an unchanged question list", () => {
  saveQuizSession("akmel-alayah", questions, { idx: 0 });
  const setItem = jest.spyOn(Storage.prototype, "setItem");

  saveQuizSession("akmel-alayah", questions, { idx: 1 });

  expect(setItem.mock.calls.map(([key]) => key)).toEqual([META_KEY]);
  setItem.mockRestore();
});

test("an empty question list starts no session", () => {
  saveQuizSession("akmel-alayah", [], { idx: 0 });

  expect(peekQuizSession()).toBeNull();
});

test.each([
  ["index past the end", { kind: "akmel-alayah", total: 3, progress: { idx: 3 } }, questions],
  ["unknown quiz", { kind: "nope", total: 3, progress: { idx: 0 } }, questions],
  ["question count mismatch", { kind: "akmel-alayah", total: 3, progress: { idx: 0 } }, [{ id: "1:1" }]],
])("a corrupt session (%s) is ignored", (_label, meta, stored) => {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  localStorage.setItem(QUESTIONS_KEY, JSON.stringify(stored));

  expect(loadQuizSession("akmel-alayah")).toBeNull();
});
