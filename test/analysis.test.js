import test from "node:test";
import assert from "node:assert/strict";
import { extractClues, connectClues, calculateRisk, MockAnalyzer, suggestCaption, PhotoAnalyzer, compareResults, cleanupCandidates } from "../dist/analysis.js";

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

test("사진 파일명은 어떤 단서도 만들지 않는다", () => {
  assert.deepEqual(extractClues([{id:"new",imageName:"이름표_학교_학원.png",text:""}]), []);
});
test("실제 OCR 결과와 좌표를 사진 단서에 연결한다", async () => {
  const reader = { read: async pixels => { assert.equal(pixels, "actual-pixels"); return { text:"Name: Alice", lines:[{text:"Name: Alice",confidence:92,bbox:{x0:2,y0:3,x1:40,y1:50}}] }; } };
  const result = await new PhotoAnalyzer(reader).analyze([{id:"new",kind:"new",image:"actual-pixels",text:""}]);
  assert.equal(result.clues[0].source, "image");
  assert.equal(result.clues[0].confidence, .92);
  assert.equal(result.clues[0].bbox.x0, 2);
});
test("OCR 실패는 안전한 결과로 바뀌지 않는다", async () => {
  const reader = { read: async () => { throw new Error("OCR failed"); } };
  await assert.rejects(new PhotoAnalyzer(reader).analyze([{id:"new",image:"pixels"}]), /OCR failed/);
});
test("변경 없는 재검사는 감소를 주장하지 않는다", () => {
  const result = {clues:[{}],connections:[{}]};
  assert.match(compareResults(result, result), /감소가 확인되지/);
  assert.match(compareResults(result, {clues:[],connections:[]}), /감소했어요/);
});
test("정리 대상으로는 연결된 기존 게시물만 선택한다", () => {
  const posts=[post("a","한빛고등학교"),post("b","일상"),post("new","이름표","new")];
  const clues=extractClues(posts);
  assert.deepEqual(cleanupCandidates(clues,connectClues(clues),posts),["a"]);
});
