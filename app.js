"use strict";

/* ============================================================
   짤·카드 스튜디오 — app.js
   A 단계 결함 수정 반영:
   - wrapTextWith(context, ...) 로 미리보기/저장 컨텍스트 분리
   - 템플릿 이름 더블클릭 인라인 편집 + 덮어쓰기
   - 이미지 2400px 다운스케일 (메타데이터 이중 제거)
   - 다운로드 파일명 downloadSeq + rnd 결합
   - 파일명 title 속성으로만 노출
   - 이모지 폰트 폴백
   - 캔버스 max-height:70vh
   ============================================================ */

/* ---------- 상수 ---------- */
const STORAGE_KEY = "jjalm-card-studio:templates:v1";
const FONT_FAMILY =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",' +
  '"Apple SD Gothic Neo","Apple Color Emoji","Segoe UI Emoji",' +
  '"Noto Color Emoji",sans-serif';
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_DIM = 2400;   // 로드 시 다운스케일 최대 변 (T03-C21, C28)

/* ---------- 상태 ---------- */
const state = {
  ratio: "1:1",
  ratios: {
    "1:1":  { w: 1080, h: 1080 },
    "4:5":  { w: 1080, h: 1350 },
    "9:16": { w: 1080, h: 1920 }
  },
  image: null,
  imageName: "",
  // [FILTER] 이미지 필터 상태값 추가
  filters: {
    brightness: 100,
    contrast: 100,
    saturate: 100
  },
  text: {
    content: "안녕하세요 😀",
    size: 48,
    color: "#ffffff",
    x: 50,
    y: 50,
    align: "center",
    weight: 700,
    stroke: 0,
    strokeColor: "#000000"
  },
  bgColor: "#5b8cff",
  templates: [],
  exportFormat: "image/png"
};
let downloadSeq = 0;

/* ---------- DOM / 유틸 ---------- */
const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const canvasWrap = $("canvasWrap");
const stage = $("stage");
const emptyHint = $("emptyHint");
const stageInfo = $("stageInfo");

let toastTimer = null;
function toast(msg, type = "") {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 2800);
}

function uid() {
  return "tpl_" + Date.now().toString(36) + "_" +
    Math.random().toString(36).slice(2, 7);
}

/* ---------- 캔버스 계산 ---------- */
function getRatioDims() { return state.ratios[state.ratio]; }

function computeImageRect(iw, ih, dw, dh) {
  const s = Math.max(dw / iw, dh / ih);
  const w = iw * s, h = ih * s;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

/* 컨텍스트 인자 방식 (T03-C11~13, C22) */
function wrapTextWith(c, text, maxWidth) {
  if (text === "") return [""];
  const lines = [];
  const paras = text.split("\n");
  for (const para of paras) {
    if (para === "") { lines.push(""); continue; }
    const words = para.split(/(\s+)/);
    let line = "";
    for (const tk of words) {
      if (tk === "") continue;
      const test = line + tk;
      if (c.measureText(test).width <= maxWidth || line === "") line = test;
      else { lines.push(line); line = tk.replace(/^\s+/, ""); }
    }
    lines.push(line);
  }
  return lines;
}

function drawTextOn(targetCtx, W, H) {
  const t = state.text;
  const fontSize = Math.max(1, t.size);
  targetCtx.font = `${t.weight} ${fontSize}px ${FONT_FAMILY}`;
  targetCtx.textBaseline = "middle";
  targetCtx.textAlign = t.align;
  targetCtx.fillStyle = t.color;

  const maxWidth = W * 0.9;
  const lines = wrapTextWith(targetCtx, t.content, maxWidth);
  const lineHeight = fontSize * 1.25;
  const totalH = lines.length * lineHeight;
  const cx = (t.x / 100) * W;
  const cy = (t.y / 100) * H;
  const startY = cy - totalH / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    const line = lines[i] || " ";
    if (t.stroke > 0) {
      targetCtx.lineJoin = "round";
      targetCtx.lineWidth = t.stroke;
      targetCtx.strokeStyle = t.strokeColor;
      targetCtx.strokeText(line, cx, y, maxWidth);
    }
    targetCtx.fillText(line, cx, y, maxWidth);
  }
  return lines;
}

/* ---------- 렌더 ---------- */
function render() {
  const { w: W, h: H } = getRatioDims();
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  if (state.image) {
    const r = computeImageRect(
      state.image.naturalWidth, state.image.naturalHeight, W, H);
    try {
      // [FILTER] 캔버스 필터 적용 (밝기, 대비, 채도)
      ctx.filter = `brightness(${state.filters.brightness}%) contrast(${state.filters.contrast}%) saturate(${state.filters.saturate}%)`;
      ctx.drawImage(state.image, r.x, r.y, r.w, r.h);
      ctx.filter = "none"; // [FILTER] 텍스트 등에 영향주지 않도록 필터 리셋
    } catch (e) {
      ctx.filter = "none"; // [FILTER] 에러 시 리셋
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, W, H);
  }

  drawTextOn(ctx, W, H);
  $("infoRatio").textContent = state.ratio;
  $("infoSize").textContent = `${W}×${H}`;
}

function showCanvas() {
  emptyHint.style.display = "none";
  canvasWrap.style.display = "flex";
  stageInfo.style.display = "flex";
}

/* ---------- 이미지 로드 ---------- */
function handleImageFile(file) {
  if (!file) return;

  if (!ACCEPTED.includes(file.type)) {
    toast(
      `지원하지 않는 형식: ${file.type || "알 수 없음"} (PNG·JPEG·WebP만)`,
      "error"
    );
    $("imgInfo").textContent = "❌ 지원하지 않는 파일 (기존 작업 유지)";
    $("imgInfo").title = file.name;
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const raw = new Image();
    raw.onload = () => {
      let w = raw.naturalWidth;
      let h = raw.naturalHeight;
      const s = Math.min(1, MAX_DIM / Math.max(w, h));
      if (s < 1) { w = Math.round(w * s); h = Math.round(h * s); }

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      off.getContext("2d").drawImage(raw, 0, 0, w, h);

      const scaled = new Image();
      scaled.onload = () => {
        state.image = scaled;
        state.imageName = file.name;
        $("imgInfo").textContent = `✅ 이미지 로드됨 (${w}×${h})`;
        $("imgInfo").title = file.name;
        render();
        showCanvas();
      };
      scaled.src = off.toDataURL("image/png");
    };
    raw.onerror = () => toast("이미지 데이터를 읽을 수 없습니다.", "error");
    raw.src = e.target.result;
  };
  reader.onerror = () => toast("파일 읽기 오류", "error");
  reader.readAsDataURL(file);
}

/* ---------- 화면비 ---------- */
function setRatio(r) {
  if (!state.ratios[r]) return;
  state.ratio = r;
  document.querySelectorAll("#ratioChips .chip")
    .forEach(c => c.classList.toggle("active", c.dataset.ratio === r));
  const d = state.ratios[r];
  $("ratioInfo").textContent = `${r} · ${d.w}×${d.h}`;
  render();
}

/* ---------- 다운로드 ---------- */
function downloadImage() {
  const { w: W, h: H } = getRatioDims();
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const octx = off.getContext("2d");

  if (state.image) {
    const r = computeImageRect(
      state.image.naturalWidth, state.image.naturalHeight, W, H);
    octx.drawImage(state.image, r.x, r.y, r.w, r.h);
  } else {
    octx.fillStyle = state.bgColor;
    octx.fillRect(0, 0, W, H);
  }
  drawTextOn(octx, W, H);

  const mime = state.exportFormat;
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  const url = off.toDataURL(mime, 0.95);

  downloadSeq++;
  const rnd = Math.random().toString(36).slice(2, 6);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    `jjalm-card_${state.ratio.replace(":", "x")}_` +
    `${Date.now()}_${downloadSeq}_${rnd}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast("다운로드 완료", "ok");
}

/* ---------- 템플릿 CRUD ---------- */
function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.templates = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.templates = [];
  }
}

function persistTemplates() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.templates));
  } catch (e) {
    toast("저장 실패 (용량 초과?)", "error");
  }
}

function renderTemplates() {
  const list = $("tplList");
  list.innerHTML = "";

  state.templates.forEach(t => {
    const div = document.createElement("div");
    div.className = "tpl-item";

    /* 이름 — 더블클릭 인라인 편집 (T03-C19 카드4) */
    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = t.name;
    nameEl.title = "더블클릭하여 이름 수정";
    nameEl.ondblclick = () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = t.name;
      const commit = () => {
        const v = input.value.trim() || t.name;
        t.name = v;
        persistTemplates();
        renderTemplates();
        toast("이름 수정됨", "ok");
      };
      input.onblur = commit;
      input.onkeydown = ev => {
        if (ev.key === "Enter") commit();
        if (ev.key === "Escape") renderTemplates();
      };
      div.replaceChild(input, nameEl);
      input.focus();
      input.select();
    };

    /* 덮어쓰기 */
    const btnOverwrite = document.createElement("button");
    btnOverwrite.textContent = "덮어쓰기";
    btnOverwrite.title = "현재 상태로 이 템플릿을 덮어씁니다";
    btnOverwrite.onclick = () => {
      t.ratio = state.ratio;
      t.text = JSON.parse(JSON.stringify(state.text));
      t.bgColor = state.bgColor;
      t.imageData = state.image ? canvas.toDataURL("image/png") : null;
      persistTemplates();
      renderTemplates();
      toast(`"${t.name}" 덮어씀`, "ok");
    };

    /* 불러오기 */
    const btnLoad = document.createElement("button");
    btnLoad.textContent = "불러오기";
    btnLoad.onclick = () => applyTemplate(t);

    /* 삭제 */
    const btnDel = document.createElement("button");
    btnDel.textContent = "삭제";
    btnDel.className = "danger";
    btnDel.onclick = () => {
      state.templates = state.templates.filter(x => x.id !== t.id);
      persistTemplates();
      renderTemplates();
      toast("삭제됨", "ok");
    };

    div.appendChild(nameEl);
    div.appendChild(btnOverwrite);
    div.appendChild(btnLoad);
    div.appendChild(btnDel);
    list.appendChild(div);
  });

  $("tplCount").textContent =
    `${state.templates.length}개 저장됨 · 새로고침 후에도 유지`;
}

function saveTemplate() {
  const name = $("tplName").value.trim();
  if (!name) {
    toast("템플릿 이름을 입력하세요", "error");
    return;
  }
  const tpl = {
    id: uid(),
    name,
    ratio: state.ratio,
    text: JSON.parse(JSON.stringify(state.text)),
    bgColor: state.bgColor,
    imageData: state.image ? canvas.toDataURL("image/png") : null
  };
  state.templates.push(tpl);
  persistTemplates();
  renderTemplates();
  $("tplName").value = "";
  toast(`템플릿 "${name}" 저장됨`, "ok");
}

function applyTemplate(t) {
  state.ratio = t.ratio;
  setRatio(t.ratio);
  state.text = JSON.parse(JSON.stringify(t.text));
  state.bgColor = t.bgColor;

  $("txtContent").value = state.text.content;
  $("txtSize").value = state.text.size;
  $("txtSizeVal").textContent = state.text.size;
  $("txtColor").value = state.text.color;
  $("txtX").value = state.text.x;
  $("txtXVal").textContent = state.text.x + "%";
  $("txtY").value = state.text.y;
  $("txtYVal").textContent = state.text.y + "%";
  $("txtAlign").value = state.text.align;
  $("txtWeight").value = state.text.weight;
  $("txtStroke").value = state.text.stroke;
  $("txtStrokeVal").textContent = state.text.stroke;
  $("txtStrokeColor").value = state.text.strokeColor;
  $("bgColor").value = state.bgColor;

  if (t.imageData) {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      showCanvas();
      render();
    };
    img.src = t.imageData;
  } else {
    state.image = null;
    render();
    showCanvas();
  }
  toast(`템플릿 "${t.name}" 불러옴`, "ok");
}

/* ---------- JSON 내보내기 / 가져오기 ---------- */
function exportJson() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: state.templates
  };
  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jjalm-templates_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("JSON 내보내기 완료", "ok");
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      toast("JSON 문법 오류 — 기존 템플릿 유지", "error");
      return;
    }

    if (!data || typeof data !== "object" || !Array.isArray(data.templates)) {
      toast("필수 항목(templates) 누락 — 기존 템플릿 유지", "error");
      return;
    }

    const before = state.templates.length;
    const valid = data.templates.filter(t =>
      t && typeof t.name === "string" &&
      t.text && typeof t.text.content === "string"
    );
    if (valid.length !== data.templates.length) {
      toast("일부 항목이 손상되어 제외됨", "error");
    }

    /* id 충돌 시 새 uid 발급 (기존 유지) */
    const idSet = new Set(state.templates.map(t => t.id));
    for (const t of valid) {
      if (!t.id || idSet.has(t.id)) t.id = uid();
      idSet.add(t.id);
      state.templates.push(t);
    }

    persistTemplates();
    renderTemplates();
    toast(`JSON 가져오기 완료 (${before} → ${state.templates.length})`, "ok");
  };
  reader.onerror = () => toast("파일 읽기 오류", "error");
  reader.readAsText(file);
}

/* ---------- 샘플 ---------- */
function loadSample(n) {
  const samples = {
    1: {
      ratio: "1:1",
      bgColor: "#222",
      text: {
        content: "오늘도\n출근 완료 😎",
        size: 90, color: "#fff", x: 50, y: 50,
        align: "center", weight: 900,
        stroke: 6, strokeColor: "#000"
      }
    },
    2: {
      ratio: "4:5",
      bgColor: "#5b8cff",
      text: {
        content: "SNS 카드\n새 소식이 도착했어요 ✨",
        size: 70, color: "#fff", x: 50, y: 40,
        align: "center", weight: 700,
        stroke: 0, strokeColor: "#000"
      }
    },
    3: {
      ratio: "9:16",
      bgColor: "#7c5cff",
      text: {
        content: "세로 스토리\n오늘의 한 컷",
        size: 80, color: "#fff", x: 50, y: 80,
        align: "center", weight: 900,
        stroke: 4, strokeColor: "#000"
      }
    }
  };

  const s = samples[n];
  if (!s) return;

  state.image = null;
  setRatio(s.ratio);
  state.bgColor = s.bgColor;
  $("bgColor").value = s.bgColor;
  state.text = JSON.parse(JSON.stringify(s.text));

  $("txtContent").value = state.text.content;
  $("txtSize").value = state.text.size;
  $("txtSizeVal").textContent = state.text.size;
  $("txtColor").value = state.text.color;
  $("txtX").value = state.text.x;
  $("txtXVal").textContent = state.text.x + "%";
  $("txtY").value = state.text.y;
  $("txtYVal").textContent = state.text.y + "%";
  $("txtAlign").value = state.text.align;
  $("txtWeight").value = state.text.weight;
  $("txtStroke").value = state.text.stroke;
  $("txtStrokeVal").textContent = state.text.stroke;
  $("txtStrokeColor").value = state.text.strokeColor;

  render();
  showCanvas();
  toast(`샘플 ${n} 불러옴`, "ok");
}

/* ---------- 캔버스 드래그 ---------- */
function bindDrag() {
  let dragging = false;

  const getPos = e => {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((cx - r.left) / r.width) * 100,
      y: ((cy - r.top) / r.height) * 100
    };
  };

  const start = e => {
    dragging = true;
    canvasWrap.classList.add("dragging");
    canvasWrap.classList.remove("grab");
    e.preventDefault();
  };

  const move = e => {
    if (!dragging) return;
    const p = getPos(e);
    state.text.x = Math.round(Math.max(-100, Math.min(200, p.x)));
    state.text.y = Math.round(Math.max(-100, Math.min(200, p.y)));
    $("txtX").value = state.text.x;
    $("txtY").value = state.text.y;
    $("txtXVal").textContent = state.text.x + "%";
    $("txtYVal").textContent = state.text.y + "%";
    render();
    e.preventDefault();
  };

  const end = () => {
    dragging = false;
    canvasWrap.classList.remove("dragging");
    canvasWrap.classList.add("grab");
  };

  canvasWrap.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvasWrap.addEventListener("touchstart", start, { passive: false });
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", end);
}

/* ---------- 이벤트 바인딩 ---------- */
function bind() {
  $("btnPickImage").onclick = () => $("fileImage").click();
  $("fileImage").onchange = e => {
    if (e.target.files[0]) handleImageFile(e.target.files[0]);
    e.target.value = "";
  };

  // [FILTER] 밝기, 대비, 채도 슬라이더 이벤트 바인딩
  $("filterBrightness").oninput = e => {
    state.filters.brightness = +e.target.value;
    $("filterBrightnessVal").textContent = e.target.value + "%";
    render();
  };
  $("filterContrast").oninput = e => {
    state.filters.contrast = +e.target.value;
    $("filterContrastVal").textContent = e.target.value + "%";
    render();
  };
  $("filterSaturate").oninput = e => {
    state.filters.saturate = +e.target.value;
    $("filterSaturateVal").textContent = e.target.value + "%";
    render();
  };

  stage.addEventListener("dragover", e => e.preventDefault());
  stage.addEventListener("drop", e => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
  });

  $("txtContent").oninput = e => {
    state.text.content = e.target.value;
    render();
    showCanvas();
  };
  $("txtSize").oninput = e => {
    state.text.size = +e.target.value;
    $("txtSizeVal").textContent = e.target.value;
    render();
  };
  $("txtColor").oninput = e => {
    state.text.color = e.target.value;
    render();
  };
  $("txtX").oninput = e => {
    state.text.x = +e.target.value;
    $("txtXVal").textContent = e.target.value + "%";
    render();
  };
  $("txtY").oninput = e => {
    state.text.y = +e.target.value;
    $("txtYVal").textContent = e.target.value + "%";
    render();
  };
  $("txtAlign").onchange = e => {
    state.text.align = e.target.value;
    render();
  };
  $("txtWeight").onchange = e => {
    state.text.weight = +e.target.value;
    render();
  };
  $("txtStroke").oninput = e => {
    state.text.stroke = +e.target.value;
    $("txtStrokeVal").textContent = e.target.value;
    render();
  };
  $("txtStrokeColor").oninput = e => {
    state.text.strokeColor = e.target.value;
    render();
  };
  $("bgColor").oninput = e => {
    state.bgColor = e.target.value;
    render();
  };

  document.querySelectorAll("#ratioChips .chip")
    .forEach(c => c.onclick = () => setRatio(c.dataset.ratio));

  $("btnDownload").onclick = downloadImage;
  $("btnDownload2").onclick = downloadImage;
  $("exportFormat").onchange = e => state.exportFormat = e.target.value;

  $("btnSaveTpl").onclick = saveTemplate;

  $("btnExportJson").onclick = exportJson;
  $("btnImportJson").onclick = () => $("fileImportJson").click();
  $("fileImportJson").onchange = e => {
    if (e.target.files[0]) importJsonFile(e.target.files[0]);
    e.target.value = "";
  };

  $("btnLoadSample1").onclick = () => loadSample(1);
  $("btnLoadSample2").onclick = () => loadSample(2);
  $("btnLoadSample3").onclick = () => loadSample(3);

  bindDrag();

  let rt = null;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(render, 100);
  });
}

/* ---------- 초기화 ---------- */
function init() {
  loadTemplates();
  renderTemplates();
  bind();
  render();
  showCanvas();
}

init();