/**
 * Provider-neutral privacy clue analysis for the PuzzleGuard MVP.
 * A production provider can replace MockAnalyzer without changing the UI.
 */

export const CLUE_TYPES = {
  identity: "신원",
  location: "장소",
  schedule: "일정",
  organization: "조직",
  relationship: "관계"
};

const rules = [
  { type: "identity", label: "이름표로 보이는 단서", pattern: /이름표|학생증|명찰|내s*이름은|제s*이름은|실명/gi, confidence: 0.74 },
  { type: "identity", label: "이름으로 보이는 텍스트", pattern: /(?:이름|성명)s*[:：]?s*[가-힣]{2,4}/gi, confidence: 0.67 },
  { type: "organization", label: "학교·교육기관 이름", pattern: /[가-힣A-Za-z0-9]+(?:초등학교|중학교|고등학교|대학교|학교|학원)/gi, confidence: 0.78 },
  { type: "organization", label: "소속·팀 이름", pattern: /동아리|축구부|농구부|합창부|학생회|대회|팀s*[A-Za-z가-힣0-9]+/gi, confidence: 0.68 },
  { type: "location", label: "장소·주소 단서", pattern: /[가-힣0-9]+(?:로|길)s*\d+|[가-힣]+역|[가-힣]+(?:카페|마트|공원|도서관|병원|아파트|빌딩)/gi, confidence: 0.71 },
  { type: "schedule", label: "반복되는 요일", pattern: /매주\s*(?:월|화|수|목|금|토|일)요일|(?:월|화|수|목|금|토|일)요일마다/gi, confidence: 0.84 },
  { type: "schedule", label: "정확한 시간", pattern: /(?:오전|오후)?\s*\d{1,2}\s*(?:시|:\d{2})\s*(?:분)?/gi, confidence: 0.8 },
  { type: "schedule", label: "특정 날짜", pattern: /\d{1,2}월\s*\d{1,2}일|\d{4}[./-]\d{1,2}[./-]\d{1,2}/gi, confidence: 0.77 },
  { type: "relationship", label: "관계 단서", pattern: /친구|선생님|쌤|팀원|담임|엄마|아빠/gi, confidence: 0.62 }
];

function short(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 32);
}

function imageFilenameClues(post) {
  if (!post.imageName) return [];
  const name = post.imageName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  const probes = [
    ["identity", "사진 파일명의 이름표 단서", /이름표|명찰|학생증/i],
    ["organization", "사진 파일명의 학교 단서", /학교|중학교|고등학교|학원/i],
    ["location", "사진 파일명의 장소 단서", /역|공원|카페|학원|학교/i]
  ];
  return probes.filter(([, , re]) => re.test(name)).map(([type, label]) => ({
    id: crypto.randomUUID(), type, label, sourcePostId: post.id, source: "image", confidence: 0.55,
    detail: `사진 파일명 “${short(name)}”에서 추정`
  }));
}

/** @param {{id:string, text?:string, imageName?:string, kind:"existing"|"new"}[]} posts */
export function extractClues(posts) {
  const clues = [];
  for (const post of posts) {
    const text = post.text || "";
    for (const rule of rules) {
      const matches = [...text.matchAll(rule.pattern)].slice(0, 2);
      for (const match of matches) clues.push({
        id: crypto.randomUUID(), type: rule.type, label: rule.label, sourcePostId: post.id,
        source: "text", confidence: rule.confidence, detail: `“${short(match[0])}”에서 추정`
      });
    }
    clues.push(...imageFilenameClues(post));
  }
  return clues;
}

function connection(title, description, clues, risk) {
  return { id: crypto.randomUUID(), title, description, clueIds: clues.map(c => c.id), risk };
}

export function connectClues(clues) {
  const by = type => clues.filter(c => c.type === type);
  const identity = by("identity"), org = by("organization"), schedule = by("schedule"), location = by("location"), relationship = by("relationship");
  const connections = [];
  if (identity.length && org.length) connections.push(connection("이름 ↔ 학교·소속", "이름으로 보이는 단서와 학교·소속 단서가 함께 있으면 특정 개인을 추정하는 데 도움이 될 가능성이 있어요.", [...identity, ...org], "high"));
  if (org.length && schedule.length) connections.push(connection("학교·소속 ↔ 반복 일정", "소속 정보와 반복되는 요일·시간이 연결되면 생활 패턴을 추정하는 데 쓰일 가능성이 있어요.", [...org, ...schedule], "medium"));
  if (identity.length && location.length) connections.push(connection("이름 ↔ 장소", "이름으로 보이는 단서와 장소 단서가 연결되면 개인을 특정할 가능성이 높아질 수 있어요.", [...identity, ...location], "high"));
  if (location.length && schedule.length) connections.push(connection("장소 ↔ 일정", "장소와 정확한 시간 정보가 함께 있으면 방문 패턴을 추정하는 데 도움이 될 수 있어요.", [...location, ...schedule], "medium"));
  if (relationship.length && (identity.length || org.length)) connections.push(connection("관계 ↔ 신원·소속", "관계 단서가 신원이나 소속 정보와 연결되면 주변 사람까지 추정될 가능성이 있어요.", [...relationship, ...identity, ...org], "medium"));
  return connections;
}

export function calculateRisk(clues, connections) {
  const types = new Set(clues.map(c => c.type));
  if (connections.some(c => c.risk === "high") && types.size >= 3) return "high";
  if (connections.some(c => c.risk === "high") || connections.length >= 2 || types.size >= 3) return "medium";
  return "low";
}

export function recommendationsFor(clues) {
  const types = new Set(clues.map(c => c.type));
  const result = [];
  if (types.has("identity")) result.push("이름표·학생증처럼 보이는 부분만 가려 보세요.");
  if (types.has("organization")) result.push("학교 로고나 소속명이 보이는 부분만 가려 보세요.");
  if (types.has("schedule")) result.push("정확한 시간·반복 요일을 ‘오늘’처럼 넓게 바꿔 보세요.");
  if (types.has("location")) result.push("장소명·주소가 드러나는 부분을 자르거나 캡션에서 빼 보세요.");
  if (!result.length) result.push("현재 입력에서 강한 연결 단서는 많지 않아요. 게시 전 사진의 배경 텍스트도 한 번 확인해 보세요.");
  return result;
}

export function suggestCaption(text = "") {
  return text
    .replace(/매주\s*(?:월|화|수|목|금|토|일)요일/gi, "오늘")
    .replace(/(?:월|화|수|목|금|토|일)요일마다/gi, "오늘")
    .replace(/(?:오전|오후)?\s*\d{1,2}\s*(?:시|:\d{2})\s*(?:분)?/gi, "")
    .replace(/[가-힣0-9]+(?:초등학교|중학교|고등학교|대학교|학교|학원)/gi, "이곳")
    .replace(/\s{2,}/g, " ").trim() || "오늘도 즐거운 하루!";
}

export class MockAnalyzer {
  async analyze(posts) {
    const clues = extractClues(posts);
    const connections = connectClues(clues);
    return { risk: calculateRisk(clues, connections), clues, connections, recommendations: recommendationsFor(clues), provider: "mock" };
  }
}

/** A server-side implementation may call a multimodal provider without exposing a key to the browser. */
export class RemoteAnalyzer {
  async analyze(posts) {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posts }) });
    if (!response.ok) throw new Error("analysis_failed");
    return response.json();
  }
}

export function getAnalyzer() {
  return window.PUZZLEGUARD_ANALYZER_URL ? new RemoteAnalyzer() : new MockAnalyzer();
}
