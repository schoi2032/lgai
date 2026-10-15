import { getAnalyzer, suggestCaption, CLUE_TYPES, compareResults } from "./analysis.js";
import { PhotoReader } from "./ocr.js";

const state = { existing: [], newPost: { id: "new", kind: "new", text: "", date: "", image: "" }, result: null, beforeResult: null, editing: null, busy: false, undo: null };
const $ = selector => document.querySelector(selector);
const analyzer = getAnalyzer(new PhotoReader());
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const postHasContent = post => Boolean(post.text.trim() || post.image);
const riskText = risk => ({low:"🟢 낮음", medium:"🟡 주의", high:"🔴 높음"})[risk];
const postName = id => id === "new" ? "새 게시물" : `기존 게시물 ${state.existing.findIndex(x => x.id === id) + 1}`;
const dateText = value => value ? new Intl.DateTimeFormat("ko-KR", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "날짜 없음";
function friendlyError(message) { $("#newError").textContent = message; $("#newError").classList.remove("hidden"); }
function clearError() { $("#newError").classList.add("hidden"); }
function syncNew() { state.newPost.text = $("#newText").value; state.newPost.date = $("#newDate").value; $("#newCounter").textContent = `${state.newPost.text.length} / 500`; clearError(); }
function invalidate() { state.result = null; state.beforeResult = null; $("#results").classList.add("hidden"); }

async function loadImage(src) { const image = new Image(); image.src = src; await image.decode(); return image; }
async function readImage(file, target) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("JPG, PNG, WEBP 이미지만 올릴 수 있어요.");
  if (file.size > 8 * 1024 * 1024) throw new Error("사진은 8MB 이하만 올릴 수 있어요.");
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (image.naturalWidth * image.naturalHeight > 40000000) throw new Error("사진의 해상도가 너무 커요. 작은 사진으로 다시 시도해 주세요.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    setImage(target, canvas.toDataURL("image/png")); invalidate();
  } catch (err) { throw new Error(err.message.startsWith("사진의") ? err.message : "사진을 읽지 못했어요. 손상되지 않은 이미지로 다시 시도해 주세요."); }
  finally { URL.revokeObjectURL(url); }
}
function setImage(target, data) {
  const post = target === "new" ? state.newPost : state.draftExisting; post.image = data;
  const preview = $(target === "new" ? "#newPreview" : "#existingPreview"); preview.src = data;
  preview.parentElement.classList.remove("hidden"); preview.parentElement.previousElementSibling.classList.add("hidden");
}
function removeImage(target) {
  const post = target === "new" ? state.newPost : state.draftExisting; post.image = "";
  const preview = $(target === "new" ? "#newPreview" : "#existingPreview");
  preview.removeAttribute("src"); preview.parentElement.classList.add("hidden"); preview.parentElement.previousElementSibling.classList.remove("hidden");
  $(target === "new" ? "#newImage" : "#existingImage").value = "";
}
function renderExisting() {
  $("#existingCount").textContent = state.existing.length; $("#existingEmpty").classList.toggle("hidden", state.existing.length > 0);
  $("#existingPosts").innerHTML = state.existing.map((post, index) => `<article class="post-card"><div class="post-thumb">${post.image ? `<img src="${post.image}" alt="기존 게시물 ${index + 1} 사진" />` : "사진 없음"}</div><div class="post-card-body"><div class="card-meta"><span>기존 게시물 ${index + 1}</span><span>${dateText(post.date)}</span></div><p>${escapeHtml(post.text || "글 내용 없음")}</p><button class="card-delete" data-delete="${post.id}">게시물 삭제</button></div></article>`).join("");
}
function snapshot() {
  state.undo = { existing: structuredClone(state.existing), newPost: structuredClone(state.newPost), result: state.result };
  $("#undoAction").classList.remove("hidden"); state.beforeResult = state.result;
}
function restore() {
  if (!state.undo) return;
  const previous = state.undo; state.existing = previous.existing; state.newPost = previous.newPost; state.result = previous.result;
  state.beforeResult = null; state.undo = null; $("#newText").value = state.newPost.text; $("#newDate").value = state.newPost.date;
  if (state.newPost.image) setImage("new", state.newPost.image); else removeImage("new");
  syncNew(); renderExisting(); $("#undoAction").classList.add("hidden");
  if (state.result) renderResults(state.result); else invalidate();
}

function renderResults(result) {
  const compared = state.beforeResult;
  const evidence = result.clues.map(c => `<div class="evidence-row"><strong>${postName(c.sourcePostId)} · ${c.source === "image" ? "사진에서 읽음" : c.source === "date" ? "입력 날짜" : "게시글"}</strong><span>${escapeHtml(c.label)} · ${escapeHtml(c.detail)}${c.confidence !== null ? ` · OCR 인식 신뢰도 ${Math.round(c.confidence * 100)}%` : ""}</span></div>`).join("") || '<p>현재 입력에서 탐지한 단서가 없어요. 안전을 보장하는 결과는 아니에요.</p>';
  const connections = result.connections.map(c => `<details class="connection"><summary>${escapeHtml(c.title)}</summary><p>${escapeHtml(c.description)}</p><p>${c.clueIds.map(id => result.clues.find(clue => clue.id === id)).filter(Boolean).map(clue => `${postName(clue.sourcePostId)}: ${escapeHtml(clue.detail)}`).join(" + ")}</p></details>`).join("") || '<p>연결된 단서가 발견되지 않았어요.</p>';
  const proposed = suggestCaption(state.newPost.text), maskable = result.clues.filter(c => c.source === "image" && c.bbox).length;
  const photos = (result.imageReadings || []).map(reading => `<details class="result-panel"><summary>${postName(reading.postId)} · 사진에서 실제로 읽은 글자</summary><p class="ocr-text">${escapeHtml(reading.text || "읽을 수 있는 텍스트가 없어요. 사진이 안전하다는 뜻은 아니에요.")}</p><img class="evidence-photo" data-evidence="${reading.postId}" alt="사진에서 탐지된 민감한 글자 영역" /></details>`).join("");
  $("#results").innerHTML = `<article class="result-card"><div class="result-top"><div><p class="eyebrow">PHOTO OCR · EVIDENCE CHECK</p><h2>${compared ? "수정 후 점검 결과" : "사진·게시물 점검 결과"}</h2><p class="result-intro">사진 픽셀에서 읽은 텍스트와 입력한 글의 연결을 분석했어요.</p></div><div class="risk ${result.risk}"><small>추정 위험도</small>${riskText(result.risk)}</div></div>
    ${compared ? `<div class="compare"><h3>실제 재분석 비교</h3><div class="compare-grid"><div><strong>수정 전</strong>단서 ${compared.clues.length}개 · 연결 ${compared.connections.length}개</div><div><strong>수정 후</strong>단서 ${result.clues.length}개 · 연결 ${result.connections.length}개</div></div><p>${compareResults(compared, result)}</p></div>` : ""}
    <p class="disclaimer">사진은 이 브라우저의 OCR 모델이 읽습니다. 파일명은 분석에 사용하지 않아요. 위험도는 규칙 기반 추정이며 OCR 인식률은 안전 점수가 아니에요. 로고·얼굴·풍경으로 신원을 추측하지 않습니다.</p>
    <div class="result-grid"><section class="result-panel"><h3>발견한 단서</h3><div class="chips">${[...new Set(result.clues.map(c => c.type))].map(type => `<span class="chip">${CLUE_TYPES[type]}</span>`).join("") || "탐지된 단서 없음"}</div></section><section class="result-panel"><h3>연결된 정보 · 눌러서 근거 보기</h3>${connections}</section></div>
    <section><h3>분석 근거</h3><div class="evidence">${evidence}</div></section><div class="readings">${photos}</div>
    <p class="disclaimer"><strong>AI의 추정이므로 사용자 확인이 필요해요.</strong> 작은 글자·흐린 사진·기울어진 글씨는 놓칠 수 있어요. 텍스트를 못 읽은 사진은 직접 확인해 주세요.</p>
    <section class="result-panel"><h3>추억은 남기고 단서만 줄이기</h3><ul class="recommendations">${result.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
    ${maskable ? `<button class="primary" id="autoMask">탐지한 민감한 글자 ${maskable}곳 자동 가리기</button>` : ""}
    ${state.newPost.text && proposed !== state.newPost.text ? `<div class="caption-change"><strong>글 수정 제안</strong><p>수정 전: ${escapeHtml(state.newPost.text)}</p><p class="after">수정 후: ${escapeHtml(proposed)}</p><button class="secondary" id="applyCaption">이 수정안 적용</button></div>` : ""}</section>
    ${result.cleanupPostIds?.length ? `<section class="result-panel cleanup-panel"><h3>연결된 기존 게시물 정리</h3><p>${result.cleanupPostIds.map(postName).join(", ")}의 단서가 연결에 사용됐어요. 수정 대신 삭제를 원하면 이 세션에서 정리할 수 있어요.</p><button class="secondary danger-text" id="cleanupPosts">연결된 기존 게시물 ${result.cleanupPostIds.length}개 삭제하기</button><p>이 앱에 추가한 자료만 삭제되며, 되돌릴 수 있어요. SNS 원본은 삭제되지 않아요.</p></section>` : ""}
    <div class="check-wrap"><button class="primary large" id="recheckButton">수정 후 다시 점검하기</button></div></article>`;
  $("#results").classList.remove("hidden");
  if (state.newPost.image) {
    const link = document.createElement("a");
    link.className = "secondary photo-download"; link.href = state.newPost.image;
    link.download = "SNS 개인정보 지킴이-사진.png"; link.textContent = "현재 새 게시물 사진 저장";
    $("#results .check-wrap").append(link);
  }
  for (const image of document.querySelectorAll("[data-evidence]")) {
    const post = [...state.existing, state.newPost].find(p => p.id === image.dataset.evidence);
    highlighted(post, result.clues).then(url => { if (image.isConnected) image.src = url; }).catch(() => {});
  }
  $("#results").focus();
}
async function highlighted(post, clues, mask = false) {
  const image = await loadImage(post.image), canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
  const unique = new Map(clues.filter(c => c.sourcePostId === post.id && c.bbox).map(c => [JSON.stringify(c.bbox), c.bbox]));
  for (const b of unique.values()) {
    const x = Math.max(0, b.x0 - 7), y = Math.max(0, b.y0 - 7), w = b.x1 - b.x0 + 14, h = b.y1 - b.y0 + 14;
    if (mask) { ctx.fillStyle = "#16261f"; ctx.fillRect(x, y, w, h); }
    else { ctx.strokeStyle = "#b53b45"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); }
  }
  return canvas.toDataURL("image/png");
}
async function runAnalysis(recheck = false) {
  if (state.busy) return;
  syncNew(); if (!postHasContent(state.newPost)) return friendlyError("새 게시물의 사진 또는 글을 입력한 뒤 점검해 주세요.");
  if (recheck && !state.beforeResult) state.beforeResult = state.result;
  if (!recheck) state.beforeResult = null;
  state.busy = true; clearError(); document.querySelectorAll("button, input, textarea").forEach(el => { el.disabled = true; });
  $("#results").classList.add("hidden"); $("#loading").classList.remove("hidden"); $("#loadingMessage").textContent = "게시물 분석 시작…";
  try {
    const result = await analyzer.analyze([...state.existing, state.newPost], message => { $("#loadingMessage").textContent = message; });
    state.result = result; renderResults(result);
  } catch (err) { state.result = null; friendlyError(err.message || "분석에 실패했어요. 다시 시도해 주세요."); }
  finally { state.busy = false; $("#loading").classList.add("hidden"); document.querySelectorAll("button, input, textarea").forEach(el => { el.disabled = false; }); }
}
async function openEditor() {
  if (!state.newPost.image) return;
  state.masks = []; state.editing = await loadImage(state.newPost.image);
  const canvas = $("#editCanvas"); canvas.width = state.editing.naturalWidth; canvas.height = state.editing.naturalHeight;
  drawCanvas(); $("#editorDialog").showModal();
}
function drawCanvas() {
  const canvas = $("#editCanvas"), ctx = canvas.getContext("2d"); ctx.drawImage(state.editing, 0, 0, canvas.width, canvas.height);
  for (const r of state.masks || []) { ctx.fillStyle = "#16261f"; ctx.fillRect(r.x, r.y, r.w, r.h); }
}
function setupCanvas() {
  const canvas = $("#editCanvas"); let start = null;
  const point = e => { const b = canvas.getBoundingClientRect(); return { x:(e.clientX-b.left)*canvas.width/b.width, y:(e.clientY-b.top)*canvas.height/b.height }; };
  canvas.addEventListener("pointerdown", e => { start = point(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", e => { if (!start) return; const end = point(e), r = {x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)}; if (r.w > 4 && r.h > 4) { state.masks.push(r); drawCanvas(); } start = null; });
}
$("#startButton").addEventListener("click", () => { $("#workspace").classList.remove("hidden"); $("#workspace").scrollIntoView({behavior:"smooth"}); });
$("#addExistingButton").addEventListener("click", () => {
  if (state.existing.length >= 10) return friendlyError("한 번에 기존 게시물 10개까지 분석할 수 있어요.");
  state.draftExisting = { id: crypto.randomUUID(), kind:"existing", text:"", date:"", image:"" };
  $("#existingForm").reset(); removeImage("existing"); $("#existingError").classList.add("hidden"); $("#existingDialog").showModal();
});
$("#newImage").addEventListener("change", e => readImage(e.target.files[0], "new").catch(err => friendlyError(err.message)));
$("#existingImage").addEventListener("change", e => readImage(e.target.files[0], "existing").catch(err => { $("#existingError").textContent = err.message; $("#existingError").classList.remove("hidden"); }));
$("#newText").addEventListener("input", () => { syncNew(); invalidate(); }); $("#newDate").addEventListener("change", () => { syncNew(); invalidate(); });
$("#existingForm").addEventListener("submit", e => {
  e.preventDefault(); const draft = state.draftExisting; draft.text = $("#existingText").value; draft.date = $("#existingDate").value;
  if (!postHasContent(draft)) { $("#existingError").textContent = "사진 또는 글을 입력해 주세요."; $("#existingError").classList.remove("hidden"); return; }
  state.existing.push(draft); renderExisting(); invalidate(); $("#existingDialog").close();
});
document.addEventListener("click", async e => {
  const target = e.target; if (state.busy) return;
  if (target.dataset.closeExisting !== undefined) $("#existingDialog").close();
  if (target.dataset.remove) { removeImage(target.dataset.remove); invalidate(); }
  if (target.dataset.edit === "new") await openEditor();
  if (target.dataset.delete) { snapshot(); state.existing = state.existing.filter(p => p.id !== target.dataset.delete); renderExisting(); invalidate(); }
  if (target.id === "applyCaption") { snapshot(); $("#newText").value = suggestCaption(state.newPost.text); await runAnalysis(true); }
  if (target.id === "recheckButton") await runAnalysis(true);
  if (target.id === "autoMask") {
    snapshot();
    state.busy = true;
    document.querySelectorAll("button, input, textarea").forEach(el => { el.disabled = true; });
    try {
      const result = state.result;
      for (const post of [...state.existing, state.newPost]) if (post.image && result.clues.some(c => c.sourcePostId === post.id && c.bbox)) post.image = await highlighted(post, result.clues, true);
      if (state.newPost.image) setImage("new", state.newPost.image);
      renderExisting(); state.busy = false; await runAnalysis(true);
    } catch (_) { friendlyError("사진을 수정하지 못했어요. 다시 시도해 주세요."); }
    finally { state.busy = false; document.querySelectorAll("button, input, textarea").forEach(el => { el.disabled = false; }); }
  }
  if (target.id === "cleanupPosts") { snapshot(); const ids = new Set(state.result.cleanupPostIds); state.existing = state.existing.filter(post => !ids.has(post.id)); renderExisting(); await runAnalysis(true); }
});
$("#undoAction").addEventListener("click", restore); $("#analyzeButton").addEventListener("click", () => runAnalysis());
$("#closeEditor").addEventListener("click", () => $("#editorDialog").close()); $("#resetMask").addEventListener("click", () => { state.masks = []; drawCanvas(); });
$("#saveMask").addEventListener("click", () => { snapshot(); setImage("new", $("#editCanvas").toDataURL("image/png")); $("#editorDialog").close(); $("#results").classList.add("hidden"); });
setupCanvas(); renderExisting();
