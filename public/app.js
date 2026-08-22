"use strict";

const state = {
  files: [],
  candidates: [],
  selectedId: null,
  shortlisted: new Set(),
  role: null,
  lastInvitation: null,
  aiConfigured: false
};

const $ = (selector) => document.querySelector(selector);
const form = $("#screeningForm");
const resumeInput = $("#resumeInput");
const dropZone = $("#dropZone");
const fileList = $("#fileList");
const resultsSection = $("#results-section");
const candidateList = $("#candidateList");
const candidateDetail = $("#candidateDetail");
const analyzeButton = $("#analyzeButton");
const scheduleDialog = $("#scheduleDialog");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { toast.className = "toast"; }, 3200);
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    state.aiConfigured = health.aiConfigured;
    $("#apiDot").classList.add("online");
    $("#apiStatus").textContent = "Agent ready";
    $("#modeBadge").textContent = health.aiConfigured ? `Hybrid AI · ${health.model}` : "Local demo mode";
    $("#aiToggleNote").textContent = health.aiConfigured
      ? `Enabled with ${health.model}; scoring remains rule-based.`
      : "No API key detected; the auditable local agent will be used.";
    if (!health.aiConfigured) $("#useAI").checked = false;
  } catch (_error) {
    $("#apiStatus").textContent = "Agent offline";
    showToast("Could not connect to the local agent.", "error");
  }
}

function setFiles(newFiles) {
  const accepted = ["pdf", "docx", "txt", "md"];
  const unique = [];
  for (const file of newFiles) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!accepted.includes(extension)) {
      showToast(`${file.name} is not a supported résumé format.`, "error");
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast(`${file.name} is larger than 5 MB.`, "error");
      continue;
    }
    if (![...state.files, ...unique].some((item) => item.name === file.name && item.size === file.size)) unique.push(file);
  }
  state.files = [...state.files, ...unique].slice(0, 10);
  renderFiles();
}

function renderFiles() {
  fileList.innerHTML = state.files.map((file, index) => `
    <div class="file-chip">
      <span title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
      <small>${formatBytes(file.size)}</small>
      <button type="button" data-remove-file="${index}" aria-label="Remove ${escapeHTML(file.name)}">×</button>
    </div>
  `).join("");
}

resumeInput.addEventListener("change", () => {
  setFiles([...resumeInput.files]);
  resumeInput.value = "";
});

fileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-file]");
  if (!button) return;
  state.files.splice(Number(button.dataset.removeFile), 1);
  renderFiles();
});

["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
}));
dropZone.addEventListener("drop", (event) => setFiles([...event.dataTransfer.files]));

async function loadExample() {
  $("#roleTitle").value = "Backend Engineer";
  $("#minExperience").value = "3";
  $("#requiredSkills").value = "Node.js, PostgreSQL, REST APIs, Git";
  $("#preferredSkills").value = "AWS, Docker, TypeScript";
  $("#jobDescription").value = "Build and maintain reliable backend services, design REST APIs, improve PostgreSQL performance, review code, and collaborate with product teams. The engineer should communicate tradeoffs clearly and own services in production.";

  try {
    const names = ["asha-sharma.txt", "rohan-mehta.txt", "meera-iyer.txt"];
    const loaded = await Promise.all(names.map(async (name) => {
      const response = await fetch(`/samples/${name}`);
      return new File([await response.blob()], name, { type: "text/plain" });
    }));
    state.files = [];
    setFiles(loaded);
    showToast("Example role and three fictional résumés loaded.");
  } catch (_error) {
    showToast("The role was loaded, but sample résumés were unavailable.", "error");
  }
}

$("#loadDemoButton").addEventListener("click", loadExample);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.files.length) return showToast("Add at least one résumé.", "error");

  const payload = new FormData();
  payload.append("roleTitle", $("#roleTitle").value);
  payload.append("minExperience", $("#minExperience").value);
  payload.append("requiredSkills", $("#requiredSkills").value);
  payload.append("preferredSkills", $("#preferredSkills").value);
  payload.append("jobDescription", $("#jobDescription").value);
  payload.append("useAI", String($("#useAI").checked));
  state.files.forEach((file) => payload.append("resumes", file));

  analyzeButton.disabled = true;
  analyzeButton.querySelector("span:first-child").textContent = "Agent is analyzing…";
  try {
    const response = await fetch("/api/analyze", { method: "POST", body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed.");

    state.candidates = result.candidates;
    state.role = result.role;
    state.shortlisted.clear();
    state.selectedId = state.candidates.find((candidate) => !candidate.error)?.id || state.candidates[0]?.id;
    renderResults(result.metadata);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`${state.candidates.length} candidate${state.candidates.length === 1 ? "" : "s"} analyzed. Review is required.`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.querySelector("span:first-child").textContent = "Analyze candidates";
  }
});

function recommendationLabel(value) {
  return ({ strong_fit: "Strong evidence", potential_fit: "Potential fit", review: "Needs review" })[value] || "File issue";
}

function renderResults(metadata) {
  const valid = state.candidates.filter((candidate) => !candidate.error);
  const strong = valid.filter((candidate) => candidate.recommendation === "strong_fit").length;
  const average = valid.length ? Math.round(valid.reduce((sum, candidate) => sum + candidate.score, 0) / valid.length) : 0;
  $("#statsGrid").innerHTML = [
    ["Reviewed", valid.length],
    ["Strong evidence", strong],
    ["Average match", `${average}%`],
    ["Shortlisted", state.shortlisted.size]
  ].map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("#candidateCount").textContent = `${state.candidates.length} total`;
  $("#resultsSubtitle").textContent = metadata.usedAI
    ? `Narratives enriched with ${metadata.model}; scoring stayed deterministic.`
    : "Local evidence analysis completed; every recommendation needs recruiter approval.";
  renderCandidateList();
  renderCandidateDetail();
}

function renderCandidateList() {
  candidateList.innerHTML = state.candidates.map((candidate) => {
    if (candidate.error) return `
      <button class="candidate-row ${candidate.id === state.selectedId ? "active" : ""}" data-candidate-id="${candidate.id}" type="button">
        <span class="score-ring">!</span>
        <span><strong>${escapeHTML(candidate.filename)}</strong><small>Could not analyze</small></span>
        <span class="recommendation-pill error-pill">Issue</span>
      </button>`;
    return `
      <button class="candidate-row ${candidate.id === state.selectedId ? "active" : ""}" data-candidate-id="${candidate.id}" type="button">
        <span class="score-ring">${candidate.score}</span>
        <span><strong>${escapeHTML(candidate.candidate.name)}</strong><small>${candidate.experienceYears} yrs estimated · ${candidate.analysisMode === "hybrid_ai" ? "hybrid AI" : "local"}</small></span>
        <span class="recommendation-pill ${candidate.recommendation}">${recommendationLabel(candidate.recommendation)}</span>
      </button>`;
  }).join("");
}

candidateList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-candidate-id]");
  if (!row) return;
  state.selectedId = row.dataset.candidateId;
  renderCandidateList();
  renderCandidateDetail();
});

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderCandidateDetail() {
  const candidate = state.candidates.find((item) => item.id === state.selectedId);
  if (!candidate) {
    candidateDetail.innerHTML = '<div class="empty-state"><p>Select a candidate to review evidence.</p></div>';
    return;
  }
  if (candidate.error) {
    candidateDetail.innerHTML = `<div class="error-state"><h3>${escapeHTML(candidate.filename)}</h3><p>${escapeHTML(candidate.error)}</p><p>Try exporting the résumé as a text-based PDF, DOCX, or TXT file.</p></div>`;
    return;
  }

  const isShortlisted = state.shortlisted.has(candidate.id);
  candidateDetail.innerHTML = `
    <div class="detail-top">
      <div class="candidate-identity">
        <span class="initials">${escapeHTML(initials(candidate.candidate.name))}</span>
        <div>
          <h3>${escapeHTML(candidate.candidate.name)}</h3>
          <p>${escapeHTML(candidate.candidate.email || "No email found")} · ${escapeHTML(candidate.filename)}</p>
        </div>
      </div>
      <div class="detail-actions">
        <button class="shortlist-button ${isShortlisted ? "selected" : ""}" id="shortlistButton" type="button">${isShortlisted ? "✓ Shortlisted" : "+ Shortlist"}</button>
        <button class="schedule-button" id="scheduleButton" type="button">Schedule</button>
      </div>
    </div>
    <div class="summary-box">
      <p>${escapeHTML(candidate.summary)}</p>
      <div class="summary-meta">
        <span>${candidate.score}/100 evidence match</span>
        <span>${candidate.experienceYears} years estimated</span>
        <span>${candidate.analysisMode === "hybrid_ai" ? "AI-enriched narrative" : "Deterministic narrative"}</span>
      </div>
    </div>
    ${candidate.aiWarning ? `<div class="audit-note"><span>!</span><p>${escapeHTML(candidate.aiWarning)}</p></div>` : ""}
    <div class="detail-grid">
      <section class="detail-section">
        <h4>Required-skill evidence</h4>
        ${candidate.skillEvidence.length ? candidate.skillEvidence.map((item) => `
          <div class="evidence-item"><strong>✓ ${escapeHTML(item.skill)}</strong><small>${escapeHTML(item.evidence)}</small></div>
        `).join("") : '<p class="muted">No required-skill evidence matched.</p>'}
      </section>
      <section class="detail-section">
        <h4>Gaps to verify</h4>
        <div class="tag-list">${candidate.missingRequired.length ? candidate.missingRequired.map((skill) => `<span class="tag missing">${escapeHTML(skill)}</span>`).join("") : '<span class="tag matched">No required gaps found</span>'}</div>
        <h4 style="margin-top:20px">Preferred evidence</h4>
        <div class="tag-list">${candidate.matchedPreferred.length ? candidate.matchedPreferred.map((skill) => `<span class="tag matched">${escapeHTML(skill)}</span>`).join("") : '<span class="tag missing">None found</span>'}</div>
        <h4 style="margin-top:20px">Review notes</h4>
        <ul class="bullet-list">${candidate.concerns.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      </section>
    </div>
    <section class="detail-section questions">
      <h4>Structured interview questions</h4>
      ${candidate.interviewQuestions.map((item, index) => `
        <div class="question-item"><span>${index + 1}</span><div><p>${escapeHTML(item.question)}</p><small>${escapeHTML(item.purpose)}</small></div></div>
      `).join("")}
    </section>
  `;

  $("#shortlistButton").addEventListener("click", toggleShortlist);
  $("#scheduleButton").addEventListener("click", openScheduleDialog);
}

function toggleShortlist() {
  if (state.shortlisted.has(state.selectedId)) state.shortlisted.delete(state.selectedId);
  else state.shortlisted.add(state.selectedId);
  renderCandidateDetail();
  const stats = $("#statsGrid").querySelectorAll(".stat-card strong");
  if (stats[3]) stats[3].textContent = state.shortlisted.size;
  showToast(state.shortlisted.has(state.selectedId) ? "Added to the recruiter shortlist." : "Removed from the shortlist.");
}

function openScheduleDialog() {
  const candidate = state.candidates.find((item) => item.id === state.selectedId);
  $("#scheduleCandidateId").value = candidate.id;
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  $("#startTime").value = new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  $("#invitationPreview").hidden = true;
  scheduleDialog.showModal();
}

$("#closeDialog").addEventListener("click", () => scheduleDialog.close());
$("#scheduleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const candidate = state.candidates.find((item) => item.id === $("#scheduleCandidateId").value);
  try {
    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateName: candidate.candidate.name,
        candidateEmail: candidate.candidate.email,
        roleTitle: state.role.title,
        startTime: new Date($("#startTime").value).toISOString(),
        duration: $("#duration").value,
        interviewerName: $("#interviewerName").value,
        meetingLink: $("#meetingLink").value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.lastInvitation = result;
    const preview = $("#invitationPreview");
    preview.hidden = false;
    preview.innerHTML = `
      <h4>${escapeHTML(result.subject)}</h4>
      <small>${escapeHTML(result.note)}</small>
      <pre>${escapeHTML(result.emailBody)}</pre>
      <div class="preview-actions">
        <button class="secondary-button" id="copyInvitation" type="button">Copy email</button>
        <button class="primary-button" id="downloadCalendar" type="button">Download .ics</button>
      </div>`;
    $("#copyInvitation").addEventListener("click", async () => {
      await navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.emailBody}`);
      showToast("Invitation draft copied. Review it before sending.");
    });
    $("#downloadCalendar").addEventListener("click", () => downloadFile("interview-invitation.ics", result.ics, "text/calendar"));
  } catch (error) {
    showToast(error.message || "Could not prepare the invitation.", "error");
  }
});

function downloadFile(filename, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

$("#exportButton").addEventListener("click", () => {
  const rows = [["Candidate", "Email", "Score", "Recommendation", "Estimated experience", "Matched required", "Missing required", "Shortlisted"]];
  state.candidates.filter((candidate) => !candidate.error).forEach((candidate) => rows.push([
    candidate.candidate.name,
    candidate.candidate.email,
    candidate.score,
    recommendationLabel(candidate.recommendation),
    candidate.experienceYears,
    candidate.matchedRequired.join("; "),
    candidate.missingRequired.join("; "),
    state.shortlisted.has(candidate.id) ? "Yes" : "No"
  ]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile("shortlist-ai-results.csv", csv, "text/csv");
  showToast("CSV report exported.");
});

checkHealth();
