const API = "";
let STATE = {
  currentTestId: null,
  currentTopicId: null,
  currentQuestions: [],
};

async function api(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(API + path, opts);
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || r.statusText);
  }
  return r.json();
}

function show(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

function goHome() {
  STATE.currentTestId = null;
  show("view-home");
  loadTests();
}

function refreshView() {
  const home = document.getElementById("view-home");
  if (!home.classList.contains("hidden")) loadTests();
  if (STATE.currentTestId && !document.getElementById("view-test").classList.contains("hidden")) {
    openTest(STATE.currentTestId);
  }
}

async function loadTests() {
  const list = document.getElementById("tests-list");
  list.innerHTML = `<div class="status"><span class="spinner"></span>…</div>`;
  try {
    const tests = await api("GET", "/api/tests");
    if (!tests.length) { list.innerHTML = `<div class="status">${t("no_tests")}</div>`; return; }
    list.innerHTML = tests.map(t_ => `
      <div class="test-item" onclick="openTest(${t_.id})">
        <div>
          <div><strong>${escapeHtml(t_.title)}</strong></div>
          <div class="test-meta">${t_.topics_count} ${t("topics").toLowerCase()} · ${t_.attempts_count} ${t("participants").toLowerCase()} · ${t_.language.toUpperCase()}</div>
        </div>
        <div class="test-meta">${new Date(t_.created_at).toLocaleDateString()}</div>
      </div>
    `).join("");
  } catch (e) { list.innerHTML = `<div class="status err">${e.message}</div>`; }
}

async function uploadFile() {
  const fileEl = document.getElementById("file-input");
  const titleEl = document.getElementById("title-input");
  const langEl = document.getElementById("lang-select");
  const btn = document.getElementById("upload-btn");
  const status = document.getElementById("upload-status");
  if (!fileEl.files[0]) { status.className = "status err"; status.textContent = "Выбери файл"; return; }

  const fd = new FormData();
  fd.append("file", fileEl.files[0]);
  if (titleEl.value) fd.append("title", titleEl.value);
  fd.append("language", langEl.value);

  btn.disabled = true;
  status.className = "status";
  status.innerHTML = `<span class="spinner"></span>${t("uploading")}`;

  try {
    const res = await api("POST", "/api/upload", fd, true);
    status.className = "status ok";
    status.textContent = `✓ ${res.topics_count} ${t("topics").toLowerCase()}`;
    fileEl.value = ""; titleEl.value = "";
    loadTests();
    openTest(res.test_id);
  } catch (e) {
    status.className = "status err"; status.textContent = e.message;
  } finally { btn.disabled = false; }
}

async function openTest(testId) {
  STATE.currentTestId = testId;
  show("view-test");
  try {
    const d = await api("GET", `/api/tests/${testId}`);
    document.getElementById("test-title").textContent = d.test.title;
    const list = document.getElementById("topics-list");
    list.innerHTML = d.topics.map(tp => `
      <div class="topic-item">
        <div>
          <div><strong>${escapeHtml(tp.name)}</strong></div>
          <div class="topic-meta">${tp.questions_count} ${t("questions_count")}</div>
        </div>
        <div class="actions">
          ${tp.questions_count > 0
            ? `<button class="primary" onclick="startQuiz(${tp.id}, '${escapeAttr(tp.name)}')">${t("start_test")}</button>
               <button class="ghost" onclick="generateQuestions(${tp.id}, this)">${t("regenerate")}</button>`
            : `<button class="primary" onclick="generateQuestions(${tp.id}, this)">${t("generate")}</button>`}
        </div>
      </div>
    `).join("");
  } catch (e) { alert(e.message); }
}

async function generateQuestions(topicId, btn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${t("generating")}`;
  try {
    await api("POST", `/api/topics/${topicId}/generate`, { count: 15 });
    openTest(STATE.currentTestId);
  } catch (e) {
    alert("AI: " + e.message);
    btn.disabled = false; btn.innerHTML = old;
  }
}

async function startQuiz(topicId, topicName) {
  STATE.currentTopicId = topicId;
  show("view-quiz");
  document.getElementById("quiz-title").textContent = topicName;
  document.getElementById("user-name").value = localStorage.getItem("user_name") || "";
  const container = document.getElementById("questions-container");
  container.innerHTML = `<div class="status"><span class="spinner"></span>…</div>`;
  try {
    const qs = await api("GET", `/api/topics/${topicId}/questions`);
    STATE.currentQuestions = qs;
    container.innerHTML = qs.map((q, i) => renderQuestion(q, i)).join("");
    attachMatchingHandlers();
  } catch (e) { container.innerHTML = `<div class="status err">${e.message}</div>`; }
}

function renderQuestion(q, i) {
  const typeLabel = { multiple_choice: t("type_mc"), open: t("type_open"), matching: t("type_matching") }[q.type];
  const typeBadge = { multiple_choice: "mc", open: "open", matching: "matching" }[q.type];
  let body = "";
  if (q.type === "multiple_choice") {
    body = `<div class="q-options">${q.options.map((opt, oi) => `
      <label class="q-option">
        <input type="radio" name="q${q.id}" value="${escapeAttr(opt)}" />
        <span>${escapeHtml(opt)}</span>
      </label>`).join("")}</div>`;
  } else if (q.type === "open") {
    body = `<input type="text" name="q${q.id}" placeholder="…" />`;
  } else if (q.type === "matching") {
    const left = q.options.left || [];
    const right = q.options.right || [];
    const shuffled = [...right].sort(() => Math.random() - 0.5);
    body = `<div class="matching-rows" data-qid="${q.id}">${left.map((lt, li) => `
      <div class="matching-row">
        <div class="term">${escapeHtml(lt)}</div>
        <span>→</span>
        <select data-term="${escapeAttr(lt)}">
          <option value="">—</option>
          ${shuffled.map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("")}
        </select>
      </div>`).join("")}</div>`;
  }
  return `<div class="question-block">
    <div class="q-label"><span class="badge ${typeBadge}">${typeLabel}</span>#${i+1}</div>
    <div class="q-text">${escapeHtml(q.question)}</div>
    ${body}
  </div>`;
}

function attachMatchingHandlers() {} // placeholder (uses selects directly)

function collectAnswers() {
  const answers = {};
  STATE.currentQuestions.forEach(q => {
    if (q.type === "multiple_choice") {
      const el = document.querySelector(`input[name="q${q.id}"]:checked`);
      answers[q.id] = el ? el.value : "";
    } else if (q.type === "open") {
      const el = document.querySelector(`input[name="q${q.id}"]`);
      answers[q.id] = el ? el.value : "";
    } else if (q.type === "matching") {
      const box = document.querySelector(`.matching-rows[data-qid="${q.id}"]`);
      const map = {};
      box.querySelectorAll("select").forEach(s => { map[s.dataset.term] = s.value; });
      answers[q.id] = map;
    }
  });
  return answers;
}

async function submitQuiz() {
  const name = document.getElementById("user-name").value.trim();
  if (!name) { alert(t("enter_name")); return; }
  localStorage.setItem("user_name", name);
  try {
    const res = await api("POST", `/api/topics/${STATE.currentTopicId}/submit`, {
      user_name: name, answers: collectAnswers()
    });
    showResult(res);
  } catch (e) { alert(e.message); }
}

function showResult(res) {
  show("view-result");
  const pct = Math.round(res.score / res.total * 100);
  document.getElementById("score-big").innerHTML =
    `${res.score} / ${res.total} <span class="pct">(${pct}%)</span>`;
  const d = document.getElementById("result-details");
  d.innerHTML = res.details.map((r, i) => {
    let user = r.user; let correct = r.correct;
    if (typeof user === "object") user = JSON.stringify(user);
    if (typeof correct === "object") correct = JSON.stringify(correct);
    return `<div class="result-item ${r.ok ? "ok" : ""}">
      <div class="q">#${i+1}. ${escapeHtml(r.question)}</div>
      <div class="ua">${t("user")}: ${escapeHtml(user || "—")}</div>
      ${!r.ok ? `<div class="ca">✓ ${escapeHtml(correct)}</div>` : ""}
    </div>`;
  }).join("");
}

function backToTest() { if (STATE.currentTestId) openTest(STATE.currentTestId); else goHome(); }

async function showResults() {
  show("view-results");
  try {
    const results = await api("GET", `/api/tests/${STATE.currentTestId}/results`);
    renderResultsTable(results);
    renderCharts(results);
  } catch (e) { alert(e.message); }
}

function renderResultsTable(results) {
  const tbl = document.getElementById("results-table");
  if (!results.length) { tbl.innerHTML = `<tr><td>${t("no_results")}</td></tr>`; return; }
  tbl.innerHTML = `<thead><tr>
    <th>${t("user")}</th><th>${t("topic")}</th><th>${t("score")}</th><th>%</th><th>${t("date")}</th>
  </tr></thead><tbody>${results.map(r => {
    const pct = Math.round(r.score / r.total * 100);
    return `<tr>
      <td>${escapeHtml(r.user_name)}</td>
      <td>${escapeHtml(r.topic_name || "—")}</td>
      <td>${r.score}/${r.total}</td>
      <td>${pct}%</td>
      <td>${new Date(r.taken_at).toLocaleString()}</td>
    </tr>`;
  }).join("")}</tbody>`;
}

let CHARTS = {};
function renderCharts(results) {
  Object.values(CHARTS).forEach(c => c && c.destroy());
  CHARTS = {};

  const byUser = {};
  results.forEach(r => {
    const pct = Math.round(r.score / r.total * 100);
    if (!byUser[r.user_name]) byUser[r.user_name] = [];
    byUser[r.user_name].push(pct);
  });
  const userAvg = Object.entries(byUser).map(([u, arr]) => ({
    u, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
  })).sort((a, b) => b.avg - a.avg).slice(0, 10);

  CHARTS.scores = new Chart(document.getElementById("chart-scores"), {
    type: "bar",
    data: {
      labels: userAvg.map(x => x.u),
      datasets: [{
        label: t("score") + " (%)",
        data: userAvg.map(x => x.avg),
        backgroundColor: "#7aa2f7",
      }],
    },
    options: {
      plugins: { title: { display: true, text: "Топ участников", color: "#e6edf3" }, legend: { labels: { color: "#e6edf3" } } },
      scales: { y: { beginAtZero: true, max: 100, ticks: { color: "#8b949e" }, grid: { color: "#2a303a" } },
                x: { ticks: { color: "#8b949e" }, grid: { color: "#2a303a" } } },
    },
  });

  const byTopic = {};
  results.forEach(r => {
    const name = r.topic_name || "—";
    if (!byTopic[name]) byTopic[name] = [];
    byTopic[name].push(r.score / r.total * 100);
  });
  const topicAvg = Object.entries(byTopic).map(([n, arr]) => ({
    n, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
  }));

  CHARTS.topics = new Chart(document.getElementById("chart-topics"), {
    type: "doughnut",
    data: {
      labels: topicAvg.map(x => x.n.slice(0, 30)),
      datasets: [{
        data: topicAvg.map(x => x.avg),
        backgroundColor: ["#7aa2f7","#bb9af7","#9ece6a","#e0af68","#f7768e","#7dcfff","#c0caf5"],
      }],
    },
    options: { plugins: { title: { display: true, text: "Средний % по темам", color: "#e6edf3" }, legend: { labels: { color: "#e6edf3" } } } },
  });
}

async function deleteTest() {
  if (!confirm(t("confirm_delete"))) return;
  try {
    await api("DELETE", `/api/tests/${STATE.currentTestId}`);
    goHome();
  } catch (e) { alert(e.message); }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

applyI18n();
loadTests();
