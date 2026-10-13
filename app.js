const STORE = {
  students: "gtec_exam_students_v1",
  questions: "gtec_exam_questions_v1",
  results: "gtec_exam_results_v1"
};
const CENTER_USERNAME = "centeradmin";
const CENTER_PASSWORD = "Gtec@123";
const $ = (id) => document.getElementById(id);
const readStore = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const allScreens = ["centerLogin","centerDashboard","studentLogin","instructions","examScreen","resultScreen"];
let activeStudent = null, examQuestions = [], answers = {}, currentQuestion = 0;
let timerInterval = null, examStartedAt = null, deadline = null, cameraStream = null, examFinished = false;

function showScreen(id) {
  allScreens.forEach(screen => $(screen).classList.toggle("hidden", screen !== id));
  window.scrollTo({top:0, behavior:"smooth"});
}
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => el.classList.remove("show"), 2600);
}
function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  const video = $("cameraVideo"); if (video) video.srcObject = null;
}
function clearTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
function students() { return readStore(STORE.students); }
function questions() { return readStore(STORE.questions); }
function results() { return readStore(STORE.results); }
function getStudentQuestions(student) {
  return questions().filter(q => q.sessionId.toLowerCase() === student.sessionId.toLowerCase());
}
function renderDashboard() {
  const ss = students(), rr = results();
  $("statStudents").textContent = ss.length;
  $("statSessions").textContent = new Set(ss.map(s => s.sessionId.toLowerCase())).size;
  $("statCompleted").textContent = rr.length;
  $("studentsTable").innerHTML = ss.length ? ss.map(s => {
    const r = rr.find(x => x.studentId === s.id);
    return `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.regNo)}</td><td>${escapeHtml(s.course)}</td><td>${escapeHtml(s.sessionId)}</td><td>${s.questionCount}</td><td>${s.duration} min</td><td>${r ? `<span class="status-pill complete">Completed · ${r.correct}/${r.total}</span>` : `<span class="status-pill">Not attempted</span>`}</td><td><div class="action-buttons"><button class="btn btn-edit btn-mini" type="button" data-edit-student="${escapeHtml(s.id)}">Edit</button><button class="btn btn-delete btn-mini" type="button" data-delete-student="${escapeHtml(s.id)}">Delete</button></div></td></tr>`;
  }).join("") : `<tr><td colspan="8" class="muted">No students onboarded yet. Use the form above to create the first student.</td></tr>`;
  $("studentsTable").querySelectorAll("[data-edit-student]").forEach(btn => btn.addEventListener("click", () => editStudent(btn.dataset.editStudent)));
  $("studentsTable").querySelectorAll("[data-delete-student]").forEach(btn => btn.addEventListener("click", () => deleteStudent(btn.dataset.deleteStudent)));
  renderQuestionSummary();
  renderManageQuestions();
}
function renderQuestionSummary() {
  const counts = {};
  questions().forEach(q => counts[q.sessionId] = (counts[q.sessionId] || 0) + 1);
  $("questionBankSummary").innerHTML = Object.keys(counts).length
    ? `<b>Question bank:</b> ${Object.entries(counts).map(([id,count]) => `${escapeHtml(id)} — ${count} question${count===1?"":"s"}`).join(" · ")}`
    : "No questions added yet.";
}
function editStudent(id) {
  const list = students();
  const s = list.find(x => x.id === id);
  if (!s) return;
  const name = prompt("Student full name:", s.name);
  if (name === null) return;
  const regNo = prompt("Registration number:", s.regNo);
  if (regNo === null) return;
  const course = prompt("Course:", s.course);
  if (course === null) return;
  const sessionId = prompt("Session ID:", s.sessionId);
  if (sessionId === null) return;
  const accessKey = prompt("Student access key:", s.accessKey);
  if (accessKey === null) return;
  const questionCount = prompt("Question allotment (30 or 45):", String(s.questionCount));
  if (questionCount === null) return;
  const duration = prompt("Exam duration in minutes:", String(s.duration));
  if (duration === null) return;
  const count = Number(questionCount), mins = Number(duration);
  if (![30,45].includes(count) || !Number.isInteger(mins) || mins < 1 || mins > 240 ||
      !name.trim() || !regNo.trim() || !course.trim() || !sessionId.trim() || !accessKey.trim()) {
    alert("Please enter valid details. Question allotment must be 30 or 45; duration must be 1–240 minutes.");
    return;
  }
  if (list.some(x => x.id !== id && x.regNo.toLowerCase() === regNo.trim().toLowerCase())) {
    alert("That registration number is already assigned to another student."); return;
  }
  const updated = list.map(x => x.id === id ? {...x, name:name.trim(), regNo:regNo.trim(), course:course.trim(), sessionId:sessionId.trim(), accessKey:accessKey.trim(), questionCount:count, duration:mins} : x);
  writeStore(STORE.students, updated);
  renderDashboard();
  toast("Student details updated.");
}
function deleteStudent(id) {
  const s = students().find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Delete ${s.name} (${s.regNo})? This also deletes this student's saved result. The session question bank will remain.`)) return;
  writeStore(STORE.students, students().filter(x => x.id !== id));
  writeStore(STORE.results, results().filter(r => r.studentId !== id));
  renderDashboard();
  toast("Student and their result deleted.");
}
function renderManageQuestions() {
  const sessionFilter = ($("manageQuestionSession")?.value || "").trim().toLowerCase();
  const search = ($("manageQuestionSearch")?.value || "").trim().toLowerCase();
  const qs = questions().filter(q =>
    (!sessionFilter || q.sessionId.toLowerCase().includes(sessionFilter)) &&
    (!search || [q.text, ...(q.options||[])].join(" ").toLowerCase().includes(search))
  );
  if (!qs.length) {
    $("manageQuestionsList").innerHTML = `<div class="manage-empty">No questions match your filters. Import a PDF above or clear the filters.</div>`;
    return;
  }
  const groups = {};
  qs.forEach(q => {
    const key = q.sessionId || "No session ID";
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  });
  $("manageQuestionsList").innerHTML = Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([sessionId,items])=>`
    <section class="question-session-group">
      <div class="question-session-header">
        <button class="session-accordion-toggle" type="button" aria-expanded="false" data-toggle-session="${escapeHtml(sessionId)}">
          <span class="session-chevron" aria-hidden="true">▸</span>
          <span class="session-title-wrap"><h3>${escapeHtml(sessionId)}</h3><small>Question bank for this session</small></span>
          <span class="session-count">${items.length} question${items.length===1?"":"s"}</span>
        </button>
        <div class="session-actions"><button class="btn btn-delete btn-mini" type="button" data-delete-session="${escapeHtml(sessionId)}">Delete entire session</button></div>
      </div>
      <div class="question-session-items hidden" data-session-content="${escapeHtml(sessionId)}">
      ${items.map(q => `
        <article class="manage-question-item" data-manage-question="${escapeHtml(q.id)}">
          <div class="manage-question-top">
            <div class="manage-question-text">${escapeHtml(q.text)}<div class="manage-question-meta">Correct answer: ${String.fromCharCode(65+q.correct)}</div></div>
            <div class="action-buttons"><button class="btn btn-edit btn-mini" type="button" data-edit-question="${escapeHtml(q.id)}">Edit</button><button class="btn btn-delete btn-mini" type="button" data-delete-question="${escapeHtml(q.id)}">Delete</button></div>
          </div>
          <div class="manage-question-options">${q.options.map((o,i)=>`<div class="${i===q.correct?"correct-option":""}">${String.fromCharCode(65+i)}. ${escapeHtml(o)}${i===q.correct?" ✓":""}</div>`).join("")}</div>
          <form class="edit-question-form hidden" data-question-edit-form="${escapeHtml(q.id)}">
            <label>Question<textarea name="questionText" rows="2" required>${escapeHtml(q.text)}</textarea></label>
            <div class="edit-options">${q.options.map((o,i)=>`<label>Option ${String.fromCharCode(65+i)}<input name="option${i}" required value="${escapeHtml(o)}"></label>`).join("")}</div>
            <label>Session ID<input name="sessionId" required value="${escapeHtml(q.sessionId)}"></label>
            <label>Correct answer<select name="correct" required>${q.options.map((o,i)=>`<option value="${i}" ${i===q.correct?"selected":""}>Option ${String.fromCharCode(65+i)}</option>`).join("")}</select></label>
            <div class="action-buttons"><button class="btn btn-primary btn-mini" type="submit">Save changes</button><button class="btn btn-outline btn-mini" data-cancel-edit="${escapeHtml(q.id)}" type="button">Cancel</button></div>
          </form>
        </article>`).join("")}
      </div>
    </section>`).join("");
  $("manageQuestionsList").querySelectorAll("[data-toggle-session]").forEach(btn=>btn.addEventListener("click",()=>{
    const sessionId=btn.dataset.toggleSession;
    const content=$("manageQuestionsList").querySelector(`[data-session-content="${CSS.escape(sessionId)}"]`);
    const isOpen=btn.getAttribute("aria-expanded")==="true";
    btn.setAttribute("aria-expanded",String(!isOpen));
    content.classList.toggle("hidden",isOpen);
  }));
  $("manageQuestionsList").querySelectorAll("[data-edit-question]").forEach(btn=>btn.addEventListener("click",()=>{
    const form=$("manageQuestionsList").querySelector(`[data-question-edit-form="${CSS.escape(btn.dataset.editQuestion)}"]`);
    form.classList.toggle("hidden");
  }));
  $("manageQuestionsList").querySelectorAll("[data-cancel-edit]").forEach(btn=>btn.addEventListener("click",()=>{
    $("manageQuestionsList").querySelector(`[data-question-edit-form="${CSS.escape(btn.dataset.cancelEdit)}"]`).classList.add("hidden");
  }));
  $("manageQuestionsList").querySelectorAll("[data-delete-session]").forEach(btn=>btn.addEventListener("click",()=>{
    const sessionId=btn.dataset.deleteSession;
    const matching=questions().filter(q=>q.sessionId===sessionId);
    if(!matching.length) return;
    const affectedStudents=students().filter(s=>s.sessionId.toLowerCase()===sessionId.toLowerCase()).length;
    const message=`Delete ALL ${matching.length} question(s) in session "${sessionId}"?`+
      (affectedStudents?`\n\n${affectedStudents} student(s) use this session. Their records and results will remain, but they won't be able to start this exam until questions are added again.`:"")+
      "\n\nThis cannot be undone.";
    if(!confirm(message)) return;
    writeStore(STORE.questions,questions().filter(q=>q.sessionId!==sessionId));
    renderDashboard();
    toast(`All questions deleted for ${sessionId}.`);
  }));
  $("manageQuestionsList").querySelectorAll("[data-delete-question]").forEach(btn=>btn.addEventListener("click",()=>{
    const qid=btn.dataset.deleteQuestion, q=questions().find(x=>x.id===qid);
    if(!q || !confirm(`Delete this question from session ${q.sessionId}?`)) return;
    writeStore(STORE.questions,questions().filter(x=>x.id!==qid));
    renderDashboard(); toast("Question deleted.");
  }));
  $("manageQuestionsList").querySelectorAll("[data-question-edit-form]").forEach(form=>form.addEventListener("submit",e=>{
    e.preventDefault();
    const fd=new FormData(form), qid=form.dataset.questionEditForm;
    const updated={
      text:String(fd.get("questionText")).trim(),
      options:[0,1,2,3].map(i=>String(fd.get(`option${i}`)).trim()),
      sessionId:String(fd.get("sessionId")).trim(),
      correct:Number(fd.get("correct"))
    };
    if(!updated.text || updated.options.some(x=>!x) || !updated.sessionId || !Number.isInteger(updated.correct) || updated.correct<0 || updated.correct>3){
      alert("Please complete the question, all four options, session ID and correct answer."); return;
    }
    writeStore(STORE.questions,questions().map(q=>q.id===qid?{...q,...updated}:q));
    renderDashboard(); toast("Question updated.");
  }));
}
$("manageQuestionSession").addEventListener("input", renderManageQuestions);
$("manageQuestionSearch").addEventListener("input", renderManageQuestions);

$("centerLoginForm").addEventListener("submit", e => {
  e.preventDefault();
  const username = $("centerUsername").value.trim(), password = $("centerPassword").value;
  if (username === CENTER_USERNAME && password === CENTER_PASSWORD) {
    $("centerLoginError").textContent = "";
    showScreen("centerDashboard"); renderDashboard();
  } else $("centerLoginError").textContent = "Incorrect username or password. Please try again.";
});
$("centerLogout").addEventListener("click", () => { $("centerPassword").value = ""; showScreen("centerLogin"); });
document.querySelectorAll(".show-password").forEach(btn => btn.addEventListener("click", () => {
  const field = $(btn.dataset.target); field.type = field.type === "password" ? "text" : "password"; btn.textContent = field.type === "password" ? "Show" : "Hide";
}));
$("onboardForm").addEventListener("submit", e => {
  e.preventDefault();
  const student = {
    id: crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: $("studentName").value.trim(),
    regNo: $("regNo").value.trim(),
    course: $("course").value.trim(),
    sessionId: $("sessionId").value.trim(),
    accessKey: $("accessKey").value.trim(),
    questionCount: Number($("questionCount").value),
    duration: Number($("duration").value),
    createdAt: new Date().toISOString()
  };
  if (students().some(s => s.regNo.toLowerCase() === student.regNo.toLowerCase())) {
    $("onboardMessage").textContent = "That registration number already exists."; $("onboardMessage").style.color = "#b42332"; return;
  }
  if (students().some(s => s.name.toLowerCase() === student.name.toLowerCase() && s.sessionId.toLowerCase() === student.sessionId.toLowerCase())) {
    $("onboardMessage").textContent = "A student with this name already exists in that session."; $("onboardMessage").style.color = "#b42332"; return;
  }
  writeStore(STORE.students, [...students(), student]);
  $("onboardMessage").style.color = "#12805c";
  $("onboardMessage").textContent = `Student access created for ${student.name}. Share the session ID and access key with them.`;
  $("onboardForm").reset(); $("questionCount").value = "30"; $("duration").value = 20;
  renderDashboard();
});
let pendingPdfQuestions = [];
let pendingPdfSessionId = "";
let pendingPdfSources = [];

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("The PDF reader could not load. Check your internet connection and reload the page.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buffer}).promise;
  let fullText = "";
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({x:item.transform[4], text:item.str});
    }
    const pageText = [...rows.entries()]
      .sort((a,b)=>b[0]-a[0])
      .map(([,items])=>items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(" "))
      .join("\n");
    fullText += "\n" + pageText + "\n";
  }
  return fullText;
}
function parseMcqs(text, sourceName) {
  const normalized = text
    .replace(/\u00a0/g," ")
    .replace(/[ \t]+/g," ")
    .replace(/\r/g,"\n");
  const lines = normalized.split("\n").map(s=>s.trim()).filter(Boolean);
  const starts = [];
  lines.forEach((line,index)=>{
    const m = line.match(/^(\d{1,3})\s*[.)]\s+(.+)/);
    if (m) starts.push({index, number:Number(m[1]), first:m[2]});
  });
  const parsed = [];
  starts.forEach((start,i)=>{
    const end = i+1 < starts.length ? starts[i+1].index : lines.length;
    let block = [start.first, ...lines.slice(start.index+1,end)].join(" ").replace(/\s+/g," ").trim();
    block = block.replace(/(?:SECTION\s+[A-Z]|Instructions?:).*$/i,"").trim();
    const optionRegex = /(?:^|\s)(?:\(?([a-d])\)?[.)])\s*/gi;
    const matches = [...block.matchAll(optionRegex)];
    if (matches.length < 4) return;
    const question = block.slice(0,matches[0].index).trim().replace(/[\s:]+$/,"");
    const options = [];
    for (let j=0;j<4;j++) {
      const from = matches[j].index + matches[j][0].length;
      const to = j+1 < matches.length ? matches[j+1].index : block.length;
      options.push(block.slice(from,to).trim().replace(/^[.)]\s*/,"").replace(/\s+/g," "));
    }
    if (!question || options.some(o=>!o)) return;
    parsed.push({
      id:`import-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sessionId:pendingPdfSessionId, text:question, options:options.slice(0,4),
      correct:-1, source:sourceName, sourceQuestionNo:start.number
    });
  });
  return parsed;
}
function renderPdfReview() {
  $("pdfReviewCount").textContent = `${pendingPdfQuestions.length} question(s) extracted from ${pendingPdfSources.length} PDF(s)`;
  $("pdfReviewList").innerHTML = pendingPdfQuestions.map((q,index)=>`
    <article class="pdf-question-review ${q.correct<0?"needs-review":""}" data-qindex="${index}">
      <span class="pdf-file-tag">${escapeHtml(q.source)} · Original Q${q.sourceQuestionNo}</span>
      <div class="pdf-question-title">${index+1}. ${escapeHtml(q.text)}</div>
      <div class="pdf-question-options">
        ${q.options.map((option,optIndex)=>`<label><input type="radio" name="pdfcorrect-${index}" value="${optIndex}" ${q.correct===optIndex?"checked":""}><span><b>${String.fromCharCode(65+optIndex)}.</b> ${escapeHtml(option)}</span></label>`).join("")}
      </div>
      <div class="pdf-correct-select"><span>Correct answer</span><select data-correct-index="${index}"><option value="-1" ${q.correct<0?"selected":""}>Select correct answer</option>${q.options.map((opt,optIndex)=>`<option value="${optIndex}" ${q.correct===optIndex?"selected":""}>${String.fromCharCode(65+optIndex)} — ${escapeHtml(opt)}</option>`).join("")}</select></div>
    </article>`).join("");
  $("pdfReviewList").querySelectorAll("select[data-correct-index]").forEach(select=>select.addEventListener("change",()=>{
    const idx=Number(select.dataset.correctIndex); pendingPdfQuestions[idx].correct=Number(select.value);
    select.closest(".pdf-question-review").classList.toggle("needs-review",pendingPdfQuestions[idx].correct<0);
    const radio=select.closest(".pdf-question-review").querySelector(`input[value="${select.value}"]`);
    if(radio) radio.checked=true;
  }));
  $("pdfReviewList").querySelectorAll('input[type="radio"]').forEach(radio=>radio.addEventListener("change",()=>{
    const card=radio.closest(".pdf-question-review"), idx=Number(card.dataset.qindex);
    pendingPdfQuestions[idx].correct=Number(radio.value);
    card.querySelector("select").value=radio.value;
    card.classList.remove("needs-review");
  }));
  $("pdfReview").classList.remove("hidden");
}
$("pdfImportForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const files=[...$("pdfFiles").files];
  const sessionId=$("pdfSessionId").value.trim();
  if(!files.length){$("pdfImportMessage").textContent="Choose at least one PDF.";return;}
  if(files.length>3){$("pdfImportMessage").textContent="Please upload a maximum of 3 PDFs at a time.";return;}
  if(files.some(f=>f.type!=="application/pdf"&&!f.name.toLowerCase().endsWith(".pdf"))){$("pdfImportMessage").textContent="Only PDF files are supported.";return;}
  $("parsePdfsButton").disabled=true; $("parsePdfsButton").textContent="Reading PDF files…";
  $("pdfImportMessage").textContent="Extracting text and identifying multiple-choice questions…";
  pendingPdfQuestions=[]; pendingPdfSources=[]; pendingPdfSessionId=sessionId;
  try{
    for(const file of files){
      const text=await extractPdfText(file);
      const extracted=parseMcqs(text,file.name);
      pendingPdfSources.push(file.name);
      pendingPdfQuestions.push(...extracted);
    }
    if(!pendingPdfQuestions.length){
      $("pdfImportMessage").textContent="No MCQs could be detected. This may be a scanned PDF or use a different layout. Try a text-based PDF.";
      $("pdfReview").classList.add("hidden");
      return;
    }
    $("pdfImportMessage").textContent=`Found ${pendingPdfQuestions.length} questions. Review the detected answers and save the bank.`;
    renderPdfReview();
  }catch(err){
    $("pdfImportMessage").textContent=err.message||"Unable to read one of the PDFs.";
  }finally{
    $("parsePdfsButton").disabled=false; $("parsePdfsButton").textContent="Extract questions from PDF(s) ↗";
  }
});
$("savePdfQuestions").addEventListener("click",()=>{
  if(!pendingPdfQuestions.length){toast("No imported questions to save.");return;}
  const missing=pendingPdfQuestions.filter(q=>q.correct<0).length;
  if(missing){$("pdfImportMessage").textContent=`Please select the correct answer for all questions. ${missing} still need review.`;return;}
  const existing=questions().filter(q=>q.sessionId.toLowerCase()!==pendingPdfSessionId.toLowerCase());
  const saved=pendingPdfQuestions.map(({source,sourceQuestionNo,...q})=>q);
  writeStore(STORE.questions,[...existing,...saved]);
  $("pdfImportMessage").textContent=`Saved ${saved.length} questions for session ${pendingPdfSessionId}.`;
  $("pdfImportMessage").style.color="#12805c";
  toast(`${saved.length} questions saved to ${pendingPdfSessionId}`);
  renderDashboard();
  $("pdfReview").classList.add("hidden");
  pendingPdfQuestions=[];
  $("pdfFiles").value="";
});
$("exportResults").addEventListener("click", () => {
  const data = results();
  if (!data.length) { toast("No completed results to export yet."); return; }
  const headers = ["Student","Registration No","Course","Session ID","Correct","Wrong","Unanswered","Total","Score %","Time Taken","Submitted At"];
  const csvRows = [headers, ...data.map(r => [r.studentName,r.regNo,r.course,r.sessionId,r.correct,r.wrong,r.unanswered,r.total,r.percent,formatTime(r.timeTakenSeconds),r.submittedAt])];
  const csv = csvRows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "gtec-exam-results.csv"; a.click(); URL.revokeObjectURL(url);
});
$("backToCenter").addEventListener("click", () => showScreen("centerLogin"));
$("studentLogout1").addEventListener("click", () => { activeStudent = null; stopCamera(); showScreen("studentLogin"); });
$("agreeRules").addEventListener("change", () => $("startExam").disabled = !$("agreeRules").checked);
$("studentLoginForm").addEventListener("submit", e => {
  e.preventDefault();
  const sessionId = $("loginSessionId").value.trim(), key = $("loginAccessKey").value.trim();
  const student = students().find(s => s.sessionId.toLowerCase() === sessionId.toLowerCase() && s.accessKey === key);
  if (!student) { $("studentLoginError").textContent = "We couldn't verify those details. Check your session ID and access key with your center."; return; }
  if (results().some(r => r.studentId === student.id)) { $("studentLoginError").textContent = "This exam has already been completed for this student login. Please contact your center."; return; }
  const bank = getStudentQuestions(student);
  if (bank.length < student.questionCount) {
    $("studentLoginError").textContent = `This session is not ready. The center has added ${bank.length} question(s), but ${student.questionCount} are required. Please contact the center.`;
    return;
  }
  activeStudent = student;
  // Randomly draw the allotted number from the complete combined bank so multiple PDFs contribute.
  examQuestions = [...bank].sort(() => Math.random() - 0.5).slice(0, student.questionCount);
  $("studentLoginError").textContent = "";
  $("detailName").textContent = student.name;
  $("detailReg").textContent = `Registration no. ${student.regNo}`;
  $("detailCourse").textContent = student.course;
  $("detailSession").textContent = student.sessionId;
  $("detailQuestions").textContent = student.questionCount;
  $("detailDuration").textContent = `${student.duration} minutes`;
  $("studentAvatar").textContent = student.name.trim().charAt(0).toUpperCase();
  $("agreeRules").checked = false; $("startExam").disabled = true; $("startError").textContent = "";
  showScreen("instructions");
});
$("startExam").addEventListener("click", async () => {
  if (!activeStudent || !$("agreeRules").checked) return;
  $("startError").textContent = "";
  if (!navigator.mediaDevices?.getUserMedia) {
    $("startError").textContent = "Camera access requires HTTPS or localhost in a supported browser. Open this site on a secure connection.";
    return;
  }
  $("startExam").disabled = true; $("startExam").textContent = "Requesting camera permission…";
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}, audio:false});
    $("cameraVideo").srcObject = cameraStream;
    await $("cameraVideo").play().catch(()=>{});
    $("cameraLabel").textContent = "Enabled";
    $("cameraMessage").textContent = "Camera is enabled for the exam. Keep it active until you submit.";
    beginExam();
  } catch (err) {
    const message = err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser settings, then try again." :
      err.name === "NotFoundError" ? "No camera was found. Connect a camera or use a device with a camera." :
      "Unable to start the camera. Check browser permissions and try again.";
    $("startError").textContent = message;
    $("startExam").disabled = false; $("startExam").innerHTML = 'Enable camera & start exam <span>→</span>';
  }
});
function beginExam() {
  answers = {}; currentQuestion = 0; examFinished = false;
  examStartedAt = Date.now(); deadline = examStartedAt + activeStudent.duration * 60000;
  $("examCourseTitle").textContent = activeStudent.course;
  $("startExam").disabled = false;
  showScreen("examScreen"); renderQuestion();
  clearTimer(); timerInterval = setInterval(updateTimer, 250); updateTimer();
}
function updateTimer() {
  if (examFinished || !deadline) return;
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  $("timerText").textContent = formatTime(remaining);
  $("timerText").parentElement.parentElement.classList.toggle("warning", remaining <= 60);
  if (remaining <= 0) submitExam(true);
}
function renderQuestion() {
  const q = examQuestions[currentQuestion], total = examQuestions.length;
  $("questionPosition").textContent = `QUESTION ${currentQuestion+1} OF ${total}`;
  $("answeredCount").textContent = `${Object.keys(answers).length} answered`;
  $("examProgress").style.width = `${((currentQuestion+1)/total)*100}%`;
  $("questionPrompt").textContent = q.text;
  $("answerOptions").innerHTML = q.options.map((opt, idx) => `
    <label class="answer-option ${answers[q.id] === idx ? "selected" : ""}">
      <input type="radio" name="answer" value="${idx}" ${answers[q.id] === idx ? "checked" : ""}>
      <span class="option-letter">${String.fromCharCode(65+idx)}</span><span class="option-text">${escapeHtml(opt)}</span>
    </label>`).join("");
  $("answerOptions").querySelectorAll("input").forEach(input => input.addEventListener("change", () => {
    answers[q.id] = Number(input.value); renderQuestion();
  }));
  $("prevQuestion").disabled = currentQuestion === 0;
  $("nextQuestion").classList.toggle("hidden", currentQuestion === total-1);
  $("submitExam").classList.toggle("hidden", currentQuestion !== total-1);
  renderPalette();
}
function renderPalette() {
  $("questionPalette").innerHTML = examQuestions.map((q,i) => `<button type="button" class="palette-btn ${i===currentQuestion?"current":""} ${answers[q.id]!==undefined?"answered":""}" data-index="${i}" aria-label="Question ${i+1}">${i+1}</button>`).join("");
  $("questionPalette").querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { currentQuestion = Number(btn.dataset.index); renderQuestion(); }));
  $("answeredCount").textContent = `${Object.keys(answers).length} answered`;
}
$("prevQuestion").addEventListener("click", () => { if (currentQuestion > 0) { currentQuestion--; renderQuestion(); } });
$("nextQuestion").addEventListener("click", () => { if (currentQuestion < examQuestions.length-1) { currentQuestion++; renderQuestion(); } });
$("submitExam").addEventListener("click", () => {
  const unanswered = examQuestions.length - Object.keys(answers).length;
  if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit the exam now?`)) return;
  submitExam(false);
});
function submitExam(auto = false) {
  if (examFinished || !activeStudent) return;
  examFinished = true; clearTimer();
  const endedAt = Date.now(), timeTakenSeconds = Math.min(activeStudent.duration*60, Math.max(0, Math.floor((endedAt-examStartedAt)/1000)));
  const detail = examQuestions.map((q, i) => {
    const chosen = answers[q.id];
    return {number:i+1, question:q.text, options:q.options, chosen:chosen === undefined ? null : chosen, correct:q.correct, status:chosen === undefined ? "unanswered" : chosen === q.correct ? "correct" : "wrong"};
  });
  const correct = detail.filter(x=>x.status==="correct").length;
  const wrong = detail.filter(x=>x.status==="wrong").length;
  const unanswered = detail.filter(x=>x.status==="unanswered").length;
  const total = detail.length, percent = total ? Math.round(correct/total*100) : 0;
  const result = {
    id:`r-${Date.now()}`, studentId:activeStudent.id, studentName:activeStudent.name, regNo:activeStudent.regNo,
    course:activeStudent.course, sessionId:activeStudent.sessionId, correct, wrong, unanswered, total, percent,
    timeTakenSeconds, submittedAt:new Date().toISOString(), autoSubmitted:auto, details:detail
  };
  writeStore(STORE.results, [...results(), result]);
  stopCamera();
  $("resultSubtitle").textContent = auto ? "The time limit ended and your answers were submitted automatically." : "Your answers have been evaluated successfully.";
  $("scorePercent").textContent = `${percent}%`;
  $("resultName").textContent = activeStudent.name;
  $("resultCourse").textContent = `${activeStudent.course} · Reg. no. ${activeStudent.regNo}`;
  $("correctBadge").textContent = `${correct} Correct`;
  $("wrongBadge").textContent = `${wrong} Wrong`;
  $("skipBadge").textContent = `${unanswered} Unanswered`;
  $("timeTaken").textContent = formatTime(timeTakenSeconds);
  $("totalQuestionsResult").textContent = total;
  $("accuracyResult").textContent = `${percent}%`;
  $("answerReview").innerHTML = detail.map(d => {
    const chosenText = d.chosen === null ? "Not answered" : `${String.fromCharCode(65+d.chosen)}. ${escapeHtml(d.options[d.chosen])}`;
    const correctText = `${String.fromCharCode(65+d.correct)}. ${escapeHtml(d.options[d.correct])}`;
    const label = d.status === "correct" ? "CORRECT" : d.status === "wrong" ? "WRONG" : "UNANSWERED";
    return `<article class="review-item"><div class="review-question">${d.number}. ${escapeHtml(d.question)} <span class="review-mark ${d.status==="correct"?"correct-badge":d.status==="wrong"?"wrong-badge":"skip-badge"}">${label}</span></div><p class="review-answer ${d.status==="correct"?"good":d.status==="wrong"?"bad":"neutral"}">Your answer: ${chosenText}</p>${d.status!=="correct"?`<p class="review-answer good">Correct answer: ${correctText}</p>`:""}</article>`;
  }).join("");
  showScreen("resultScreen");
}
$("finishExam").addEventListener("click", () => {
  activeStudent = null; examQuestions = []; answers = {}; $("studentLoginForm").reset();
  showScreen("studentLogin");
});
window.addEventListener("beforeunload", e => {
  if (!examFinished && examStartedAt) { e.preventDefault(); e.returnValue = ""; }
});
// Student login is available from the persistent header CTA.
$("studentEntryButton").addEventListener("click", () => showScreen("studentLogin"));
