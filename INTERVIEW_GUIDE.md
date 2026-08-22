# How to Present ShortlistAI in an Interview

Do not describe this as “an AI that decides who gets hired.” The strongest story is that you built an explainable workflow agent that helps recruiters review evidence consistently while preserving human accountability.

## 30-second pitch

> I built ShortlistAI, a human-in-the-loop recruitment screening agent. A recruiter defines an objective role rubric and uploads résumés. The agent parses the documents, calculates an auditable evidence-match score, identifies gaps to verify, and prepares structured interview questions. An optional OpenAI model improves the narrative, but it cannot change the score. Shortlisting and scheduling always require recruiter action, and scheduling only creates an email and calendar draft. I focused as much on explainability, privacy, and failure handling as on the AI call itself.

## Two-minute explanation

> The problem I chose was not “replace the recruiter.” It was “reduce repetitive résumé comparison while making the reasoning visible.”
>
> The frontend is a responsive vanilla JavaScript application. The Node and Express backend accepts PDF, DOCX, text, and Markdown résumés in memory. A deterministic engine extracts job-related evidence and computes a weighted score: required skills, preferred skills, experience baseline, and evidence completeness.
>
> I intentionally separated scoring from generative AI. If an OpenAI key is configured, the server removes names, contact information, and explicit personal attributes before sending the résumé through the Responses API. Structured output produces a neutral summary, concerns to verify, and five interview questions. The model cannot alter the score, and an API failure falls back to the local engine.
>
> Finally, the recruiter can manually shortlist a candidate and prepare an email plus ICS event. Nothing is sent automatically. This gave me a realistic agent workflow with tools, state, error handling, approvals, tests, and responsible-AI safeguards.

## Five-minute live demo script

Keep the demo moving. Do not spend the first three minutes explaining setup.

### 0:00–0:30 — Frame the problem

Say:

> Recruiters repeatedly compare inconsistent résumés against the same job description. This demo structures that evidence without pretending the score is a hiring decision.

### 0:30–1:00 — Show the rubric

1. Select **Load example**.
2. Point out the role, minimum experience, required skills, and preferred skills.
3. Say that the recruiter—not the model—defines the evaluation criteria.

### 1:00–1:45 — Run the agent

1. Point out the three fictional résumés.
2. Select **Analyze candidates**.
3. While it runs, explain the parser → deterministic engine → optional AI narrative flow.

### 1:45–3:00 — Explain a result

1. Open Asha Sharma.
2. Show the 98 score, exact evidence lines, and no required-skill gaps.
3. Open Rohan Mehta and show how PostgreSQL is a gap to verify rather than a rejection.
4. Show the structured questions tied to matched or missing evidence.

Say:

> The important design choice is that every score component is traceable. The LLM improves language, but it cannot silently change ranking logic.

### 3:00–4:00 — Show human approval

1. Select **Shortlist**.
2. Select **Schedule**.
3. Prepare an invitation.
4. Point out the message: “Drafted only—nothing was sent automatically.”

Say:

> Consequential actions stop at an approval boundary. A production calendar integration would reuse this exact checkpoint.

### 4:00–5:00 — Close with engineering depth

Mention:

- Multi-format, in-memory file parsing
- Personal-data redaction before model calls
- Structured JSON output instead of parsing free-form text
- Graceful local fallback when the AI call fails
- Nine automated tests plus a real browser walkthrough
- The production roadmap: authentication, queues, database, ATS/calendar integrations, OCR, monitoring, and fairness evaluation

End with:

> This project shows how I approach AI products: constrain the model, make decisions observable, design safe failure modes, and keep the user responsible for high-impact actions.

## Architecture explanation on a whiteboard

Draw this:

```text
Recruiter
   ↓
Browser UI
   ↓
Express API ──→ File parser
                  ↓
          Deterministic scoring
             ↙           ↘
     visible evidence     redacted résumé
                               ↓
                     OpenAI structured output
             ↘                 ↙
                  Human review
                       ↓
            Shortlist / draft invitation
```

Then explain the boundary:

- Deterministic code owns the score.
- The model owns only narrative assistance.
- The recruiter owns the decision.

That single separation is the main architectural idea.

## Strong answers to likely interview questions

### “Is this really an agent or just an API call?”

> It is a bounded workflow agent. It receives a goal and unstructured inputs, chooses the appropriate parsing path based on file type, extracts evidence, applies a rubric, optionally invokes a model tool, maintains shortlist state, and prepares an action for approval. It is not a general autonomous agent, and I would not pretend it is. The bounded design is appropriate for a high-impact workflow.

### “Why not let the model calculate the score?”

> Hiring support needs repeatability and traceability. A model-generated score can change with wording or sampling and is difficult to audit. I keep scoring deterministic and use the model where it adds value: summarization and tailored questions. That also gives a reliable no-API fallback.

### “How do you reduce bias?”

> First, the recruiter enters explicit job-related criteria. Second, names, contact information, and explicit personal attributes are redacted before model enrichment. Third, school prestige and vague personality traits are not score inputs. Fourth, missing evidence becomes a question to verify instead of an automatic rejection. Finally, every decision remains human-reviewed. In production I would add jurisdiction-specific legal review, adverse-impact testing, versioned rubrics, and candidate appeal processes.

### “What if the model hallucinates?”

> The prompt limits the model to résumé evidence, structured output constrains the shape, and the UI shows deterministic evidence separately. The model cannot modify the score. If the request fails or returns invalid data, the system falls back to local results. A production version would also validate narrative claims against retrieved evidence spans and run regression evaluations.

### “Why use structured outputs?”

> The UI requires a stable summary, strengths, concerns, and exactly five question/purpose pairs. A JSON schema removes fragile regular-expression parsing and lets the server reject malformed results predictably.

### “How do you protect candidate data?”

> The MVP keeps uploads in server memory and does not write them to disk. It removes names, email addresses, phone numbers, and explicit personal details before an optional model call, uses `store: false`, and keeps the API key only on the server. Production would require encryption, access controls, retention deletion jobs, regional processing decisions, security review, consent, and complete audit logging.

### “How would this scale to 10,000 résumés?”

> I would move parsing and enrichment into queue workers, store job and result state in PostgreSQL, use object storage with malware scanning, batch deterministic work, rate-limit model requests, cache role rubrics, and stream progress to the UI. I would also separate ingestion, scoring, enrichment, and export services so each can scale independently.

### “How would you evaluate quality?”

> I would build a labeled test set created by multiple trained recruiters. For extraction I would measure skill-evidence precision and recall. For summaries and questions I would score factual consistency, relevance, and harmful inference rates. For the product I would measure recruiter agreement, time saved, correction rate, and fairness metrics where collection is lawful and properly governed. I would not optimize only for agreement with historical hiring decisions because those can encode past bias.

### “Why vanilla JavaScript instead of React?”

> For this MVP the workflow fits into one page, so vanilla JavaScript removes a build step and makes the project easy to run in an interview. The separation between API, state, and rendering is still clear. If the application grew to multiple teams, reusable components, routing, and complex state, I would move the frontend to React or another component framework.

### “What was the hardest bug?”

> Browser testing revealed that experience estimation was taking the shortest value when a résumé contained several date ranges. The original unit test passed because its values happened to be equal. I corrected the aggregation, added a regression assertion using a realistic résumé, and reran the browser workflow. Visual QA also caught a hidden checkbox causing horizontal overflow. These were good reminders that unit tests and real user-path testing catch different classes of defects.

### “What would you build next?”

> My next vertical slice would be authenticated recruiter workspaces with persisted, versioned rubrics and immutable audit events. After that I would add an approval-based Google or Microsoft calendar integration, then evaluation dashboards and an ATS connector. I would avoid adding more model autonomy until the audit and evaluation foundation exists.

## STAR-format project story

**Situation:** Recruiters spend time repeatedly comparing résumés, while opaque AI ranking can create trust and fairness risks.

**Task:** Build a realistic agent demo that reduces repetitive work, explains its reasoning, handles several document formats, and preserves human control.

**Action:** I created an Express API and responsive frontend, implemented deterministic weighted scoring, parsed PDF/DOCX/text uploads in memory, added personal-data redaction and structured OpenAI output, built a local fallback, added shortlisting and ICS/email drafting, and tested the full workflow with unit, API, and browser checks.

**Result:** The agent analyzes three sample candidates, shows exact skill evidence and gaps, produces five interview questions per candidate, and prepares an invitation without sending it. Nine automated tests pass, and browser QA caught and fixed experience-estimation and layout defects.

## Résumé bullet points

Use two or three bullets, not all of them:

- Built a human-in-the-loop recruitment screening agent using Node.js, Express, document parsing, and the OpenAI Responses API, supporting PDF, DOCX, TXT, and Markdown résumés.
- Designed an auditable hybrid evaluation pipeline where deterministic scoring controls ranking while redacted structured AI output generates evidence-based summaries and interview questions.
- Implemented approval-gated shortlisting and interview invitation drafts, CSV export, graceful AI fallback, responsive UI, and nine automated unit/API tests.
- Added responsible-AI controls including protected-data redaction, explicit evidence citations, no automatic rejection, in-memory uploads, and recruiter approval for consequential actions.

Do not claim that the system is “bias-free,” “production-ready,” or “legally compliant.” Say that it includes safeguards and that production deployment requires legal, security, and fairness review.

## GitHub project description

> An explainable, human-in-the-loop recruitment screening agent that parses résumés, scores job-related evidence deterministically, generates structured interview questions with optional OpenAI enrichment, and prepares approval-based interview invitations.

Suggested repository topics:

```text
ai-agent, recruitment, nodejs, express, openai, responsible-ai, structured-outputs, human-in-the-loop
```

## Questions you can ask the interviewer

- Where does your team draw the boundary between model judgment and deterministic business rules?
- How do you evaluate factuality and failure modes before shipping an AI feature?
- What observability do you use for multi-step agent workflows?
- How are approval gates designed for actions that affect customers or employees?
- How do product, legal, security, and ML teams collaborate on high-impact AI use cases?

These questions make the conversation about engineering judgment, not merely model familiarity.

## Final interview advice

- Run the app before the interview and keep the example role ready.
- Keep a backup screen recording or screenshots in case venue Wi-Fi is unreliable.
- Start with the user problem, not the framework list.
- Show one strong candidate and one evidence-gap candidate.
- Explain one deliberate tradeoff and one bug you found.
- Be honest that this is an MVP and state exactly what production work remains.
- Invite the interviewer to choose a different role or edit the rubric live.

The most hireable part of this project is not that it calls a model. It is that you can explain where the model is useful, where it is unsafe, how the system fails, and how you verified the result.
