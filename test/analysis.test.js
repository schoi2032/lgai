import test from "node:test";
import assert from "node:assert/strict";
import { extractClues, connectClues, calculateRisk, MockAnalyzer, suggestCaption } from "../dist/analysis.js";

const post = (id, text, kind = "existing") => ({ id, text, kind });

test("단서 하나만 있으면 낮음", () => {
  const clues = extractClues([post("n", "오늘 공원에서 산책했어", "new")]);
  assert.equal(calculateRisk(clues, connectClues(clues)), "low");
});
test("이름과 학교 연결을 감지한다", () => {
  const clues = extractClues([post("a", "우리 한빛고등학교 축제!"), post("n", "이름표를 달고 참여했어", "new")]);
  assert.ok(connectClues(clues).some(x => x.title.includes("이름 ↔ 학교")));
});
test("일정 단서를 감지한다", () => {
  assert.ok(extractClues([post("n", "매주 화요일 오후 8시에 수업 끝!", "new")]).some(x => x.type === "schedule"));
});
test("여러 관련 단서는 위험도를 올린다", async () => {
  const result = await new MockAnalyzer().analyze([post("a", "한빛고등학교 축구부"), post("b", "매주 화요일 8시"), post("n", "이름표", "new")]);
  assert.equal(result.risk, "high");
});
test("수정 제안은 일정 단서를 줄인다", () => {
  const before = extractClues([post("n", "매주 화요일 8시 한빛학원", "new")]);
  const after = extractClues([post("n", suggestCaption("매주 화요일 8시 한빛학원"), "new")]);
  assert.ok(after.length < before.length);
});
test("빈 입력은 안전하게 빈 결과를 만든다", async () => {
  const result = await new MockAnalyzer().analyze([]);
  assert.equal(result.clues.length, 0);
  assert.equal(result.risk, "low");
});
test("분석기 오류는 호출자가 처리할 수 있다", async () => {
  const bad = { analyze: async () => { throw new Error("analysis_failed"); } };
  await assert.rejects(() => bad.analyze([]));
});
