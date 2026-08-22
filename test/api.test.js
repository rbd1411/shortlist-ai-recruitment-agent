"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../server");

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("health endpoint reports a ready local agent", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.aiConfigured, "boolean");
});

test("analysis endpoint accepts a résumé and returns ranked evidence", async () => {
  const sample = fs.readFileSync(path.join(__dirname, "../public/samples/asha-sharma.txt"));
  const form = new FormData();
  form.append("roleTitle", "Backend Engineer");
  form.append("minExperience", "3");
  form.append("requiredSkills", "Node.js, PostgreSQL, REST APIs, Git");
  form.append("preferredSkills", "AWS, Docker, TypeScript");
  form.append("jobDescription", "Build production backend services.");
  form.append("useAI", "false");
  form.append("resumes", new File([sample], "asha-sharma.txt", { type: "text/plain" }));

  const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: form });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.candidates.length, 1);
  assert.equal(body.candidates[0].candidate.name, "Asha Sharma");
  assert.equal(body.candidates[0].recommendation, "strong_fit");
  assert.equal(body.metadata.usedAI, false);
});

test("schedule endpoint drafts an email and calendar event without sending", async () => {
  const response = await fetch(`${baseUrl}/api/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidateName: "Asha Sharma",
      candidateEmail: "asha@example.com",
      roleTitle: "Backend Engineer",
      startTime: "2030-01-15T10:00:00.000Z",
      duration: 45,
      interviewerName: "Demo Recruiter"
    })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.emailBody, /Asha Sharma/);
  assert.match(body.ics, /BEGIN:VCALENDAR/);
  assert.match(body.note, /nothing was sent/i);
});
