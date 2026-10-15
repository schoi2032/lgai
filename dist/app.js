import { getAnalyzer, suggestCaption, CLUE_TYPES } from "./analysis.js";

const state = { existing: [], newPost: { id: "new", kind: "new", text: "", date: "", image: "", imageName: "" }, result: null, beforeResult: null, editsApplied: false, editing: null };
const $ = selector => document.querySelector(selector);
const analyzer = getAnalyzer();

function escapeHtml(value = "") { return value.replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
function postHasContent(post) { return Boolean(post.text.trim() || post.image); }
function dateText(value) { return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "날짜 없음"; }
function friendlyError(message) { $("#newError").textContent = message; $("#newError").classList.remove("hidden"); }
function clearError() { $("#newError").classList.add("hidden"); }

function readImage(file, target) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return reject(new Error("JPG, PNG, WEBP 이미지만 올릴 수 있어요."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("사진은 8MB 이하만 올릴 수 있어요."));
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result, name: file.name });
    reader.onerror = () => reject(new Error("사진을 읽지 못했어요. 다른 파일로 다시 시도해 주세요."));
    reader.readAsDataURL(file);
  }).then(image => { if (image) setImage(target, image); return image; });
}

function setImage(target, image) {
  const isNew = target === "new";
  const post = isNew ? state.newPost : state.draftExisting;
  post.image = image.data; post.imageName = image.name;
  const preview = isNew ? "#newPreview" : "#existingPreview";
  $(preview).src = image.data;
  $(preview).parentElement.classList.remove("hidden");
  $(preview).parentElement.previousElementSibling.classList.add("hidden");
}

function removeImage(target) {
  const isNew = target === "new";
  const post = isNew ? state.newPost : state.draftExisting;
  post.image = ""; post.imageName = "";
  const preview = isNew ? "#newPreview" : "#existingPreview";
  $(preview).src = "";
  $(preview).parentElement.classList.add("hidden");
  $(preview).parentElement.previousElementSibling.classList.remove("hidden");
  $(isNew ? "#newImage" : "#existingImage").value = "";
}

function syncNew() { state.newPost.text = $("#newText").value; state.newPost.date = $("#newDate").value; $("#newCounter").textContent = `${state.newPost.text.length} / 500`; clearError(); }
function renderExisting() {
  const list = $("#existingPosts"), empty = $("#existingEmpty");
  $("#existingCount").textContent = state.existing.length;
  empty.classList.toggle("hidden", state.existing.length > 0);
  list.innerHTML = state.existing.map((post, index) => `<article class="post-card"><div class="post-thumb">${post.image ? `<img src="${post.image}" alt="기존 게시물 ${index + 1} 사진" />` : "사진 없음"}</div><div class="post-card-body"><div class="card-meta"><span>기존 게시물 ${index + 1}</span><span>${dateText(post.date)}</span></div><p>${escapeHtml(post.text || "글 내용 없음")}</p><button class="card-delete" data-delete="${post.id}">게시물 삭제</button></div></article>`).join("");
}

function riskText(risk) { return ({low:"🟢 낮음", medium:"🟡 주의", high:"🔴 높음"})[risk]; }
function postName(id) { return id === "new" ? "새 게시물" : `기존 게시물 ${state.existing.findIndex(x => x.id === id) + 1}`; }
function clueLabel(clue) { return `${clue.label} · 신뢰도 ${Math.round(clue.confidence * 100)}%`; }
function renderResults(result) {
  const isUpdated = state.editsApplied && state.beforeResult;
  const groups = [...new Map(result.clues.map(c => [c.type, c])).values()];
  const evidence = result.clues.slice(0, 8).map(c => `<div class="evidence-row"><strong>${postName(c.sourcePostId)}</strong><span>${escapeHtml(c.label)} · ${escapeHtml(c.detail)}</span></div>`).join("") || `<p class="result-intro">강한 개인정보 단서를 찾지 못했어요.</p>`;
  const connections = result.connections.map((c, i) => `<div class="connection"><strong>${escapeHtml(c.title)}</strong><p>${escapeHtml(c.description)}</p><button type="button" data-why="${i}">왜 위험한가?</button><p class="hidden" id="why-${i}">각 단서는 단독으로는 큰 문제가 아닐 수 있지만, 함께 보면 사용자의 신원이나 생활 패턴을 추정하는 데 도움이 될 수 있습니다.</p></div>`).join("") || `<p class="result-intro">아직 뚜렷하게 연결되는 단서는 많지 않아요.</p>`;
  const proposed = suggestCaption(state.newPost.text);
  $("#results").innerHTML = `<article class="result-card"><div class="result-top"><div><p class="eyebrow">STEP 02 · ANALYSIS RESULT</p><h2>${isUpdated ? "수정 후 점검 결과" : "점검 결과"}</h2><p class="result-intro">${result.risk === "low" ? "의미 있는 개인정보 연결이 거의 발견되지 않았어요." : "새 게시물의 단서가 기존 게시물과 연결될 가능성이 있어요."}</p></div><div class="risk ${result.risk}"><small>AI 추정 위험도</small>${riskText(result.risk)}</div></div>${isUpdated ? `<div class="compare"><h3>수정 전 · 수정 후</h3><div class="compare-grid"><div><strong>수정 전</strong>${state.beforeResult.clues.map(c => escapeHtml(CLUE_TYPES[c.type])).filter((v,i,a)=>a.indexOf(v)===i).join(" · ") || "뚜렷한 단서 없음"}</div><div><strong>수정 후</strong>${result.clues.map(c => escapeHtml(CLUE_TYPES[c.type])).filter((v,i,a)=>a.indexOf(v)===i).join(" · ") || "단서 감소"}</div></div><p class="result-intro">연결 가능한 개인정보 단서가 감소했어요.</p></div>` : ""}<div class="result-grid"><section class="result-panel"><h3>발견한 단서</h3><div class="chips">${groups.map(c => `<span class="chip">${escapeHtml(clueLabel(c))}</span>`).join("") || '<span class="chip">발견된 강한 단서 없음</span>'}</div></section><section class="result-panel"><h3>연결된 정보</h3>${connections}</section></div><section><h3>분석 근거</h3><div class="evidence">${evidence}</div></section><p class="disclaimer"><strong>AI의 추정이므로 사용자 확인이 필요해요.</strong> 이 결과는 AI가 분석한 참고 정보입니다. 실제 의미는 사용자가 확인해야 합니다.</p><section class="result-panel"><h3>이렇게 수정해 보세요</h3><ul class="recommendations">${result.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>${state.newPost.text && proposed !== state.newPost.text ? `<div class="caption-change"><strong>글 수정 제안</strong><p>수정 전: ${escapeHtml(state.newPost.text)}</p><p class="after">수정 후: ${escapeHtml(proposed)}</p><button class="secondary" id="applyCaption">이 수정안 적용</button></div>` : ""}</section><div class="check-wrap"><button class="primary large" id="recheckButton">수정 후 다시 점검하기</button></div></article>`;
  $("#results").classList.remove("hidden");
  $("#results").focus();
}

async function runAnalysis(recheck = false) {
  syncNew();
  if (!postHasContent(state.newPost)) return friendlyError("새 게시물의 사진 또는 글을 입력한 뒤 점검해 주세요.");
  clearError();
  $("#results").classList.add("hidden"); $("#loading").classList.remove("hidden");
  const messages = ["사진 속 단서 찾는 중…", "게시물 사이의 연결 분석 중…", "개인정보 노출 가능성 계산 중…"];
  for (const message of messages) { $("#loadingMessage").textContent = message; await new Promise(resolve => setTimeout(resolve, 340)); }
  try {
    const result = await analyzer.analyze([...state.existing, state.newPost]);
    if (recheck && !state.beforeResult) state.beforeResult = state.result;
    state.result = result; renderResults(result);
  } catch (_) { friendlyError("분석에 실패했어요. 잠시 후 다시 시도해 주세요."); }
  finally { $("#loading").classList.add("hidden"); }
}

function openEditor() {
  if (!state.newPost.image) return;
  state.masks = [];
  state.editing = new Image(); state.editing.onload = () => {
    const canvas = $("#editCanvas"); const ratio = Math.min(620 / state.editing.width, 390 / state.editing.height, 1); canvas.width = state.editing.width * ratio; canvas.height = state.editing.height * ratio; drawCanvas(); $("#editorDialog").showModal();
  }; state.editing.src = state.newPost.image;
}
function drawCanvas() { const canvas = $("#editCanvas"), ctx = canvas.getContext("2d"); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(state.editing,0,0,canvas.width,canvas.height); for (const r of (state.masks || [])) { ctx.fillStyle="#16261f"; ctx.fillRect(r.x,r.y,r.w,r.h); } }
function setupCanvas() { const canvas = $("#editCanvas"); let start = null; canvas.addEventListener("pointerdown", e => { start = point(e); canvas.setPointerCapture(e.pointerId); }); canvas.addEventListener("pointerup", e => { if (!start) return; const end = point(e), r = { x:Math.min(start.x,end.x), y:Math.min(start.y,end.y), w:Math.abs(end.x-start.x), h:Math.abs(end.y-start.y) }; if (r.w > 4 && r.h > 4) { state.masks = [...(state.masks || []),r]; drawCanvas(); } start = null; }); function point(e) { const b=canvas.getBoundingClientRect(); return {x:(e.clientX-b.left)*canvas.width/b.width,y:(e.clientY-b.top)*canvas.height/b.height}; } }

$("#startButton").addEventListener("click", () => { $("#workspace").classList.remove("hidden"); $("#workspace").scrollIntoView({behavior:"smooth"}); });
$("#addExistingButton").addEventListener("click", () => { state.draftExisting = { id: crypto.randomUUID(), kind:"existing", text:"", date:"", image:"", imageName:"" }; $("#existingForm").reset(); removeImage("existing"); $("#existingError").classList.add("hidden"); $("#existingDialog").showModal(); });
$("#newImage").addEventListener("change", e => readImage(e.target.files[0], "new").catch(err => friendlyError(err.message)));
$("#existingImage").addEventListener("change", e => readImage(e.target.files[0], "existing").catch(err => { $("#existingError").textContent=err.message; $("#existingError").classList.remove("hidden"); }));
$("#newText").addEventListener("input", syncNew); $("#newDate").addEventListener("change", syncNew);
$("#existingForm").addEventListener("submit", e => { e.preventDefault(); const draft=state.draftExisting; draft.text=$("#existingText").value; draft.date=$("#existingDate").value; if (!postHasContent(draft)) { $("#existingError").textContent="사진 또는 글을 입력해 주세요."; $("#existingError").classList.remove("hidden"); return; } state.existing.push(draft); renderExisting(); $("#existingDialog").close(); });
document.addEventListener("click", e => { const target=e.target; if (target.dataset.closeExisting !== undefined) $("#existingDialog").close(); if (target.dataset.remove) removeImage(target.dataset.remove); if (target.dataset.edit === "new") openEditor(); if (target.dataset.delete) { state.existing=state.existing.filter(p=>p.id!==target.dataset.delete); renderExisting(); } if (target.dataset.why !== undefined) $("#why-"+target.dataset.why).classList.toggle("hidden"); if (target.id === "applyCaption") { state.beforeResult=state.result; state.editsApplied=true; $("#newText").value=suggestCaption(state.newPost.text); syncNew(); runAnalysis(true); } if (target.id === "recheckButton") { state.beforeResult=state.result; state.editsApplied=true; runAnalysis(true); } });
$("#analyzeButton").addEventListener("click", () => runAnalysis(false));
$("#closeEditor").addEventListener("click", () => $("#editorDialog").close()); $("#resetMask").addEventListener("click", () => { state.masks=[]; drawCanvas(); }); $("#saveMask").addEventListener("click", () => { state.newPost.image=$("#editCanvas").toDataURL("image/png"); state.newPost.imageName="edited-image.png"; $("#newPreview").src=state.newPost.image; $("#editorDialog").close(); });
setupCanvas(); renderExisting();
