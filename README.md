# G-TEC Education Exam Portal (HTML, CSS, JavaScript)

A browser-only prototype for student onboarding, timed MCQ exams, camera permission, automatic submission, and result review.

## Run locally

1. Extract the ZIP.
2. Open the folder in VS Code.
3. Start a local server, for example with the VS Code **Live Server** extension.
4. Open the localhost URL it gives you. Camera access generally requires **HTTPS or localhost**; opening the HTML file directly may not allow the camera.
5. Sign in to Center Access using the demo credentials below.

## Demo center login

- Username: `centeradmin`
- Password: `Gtec@123`

Change these values in `app.js` before showing the prototype to anyone.

## Center workflow

1. Sign in to Center Access.
2. Under **Onboard a student**, enter the student's full name, registration number, course, session ID, access key, question count and exam duration.
3. Under **Import questions from PDF**, upload up to 3 text-based question-paper PDFs at once and enter the exact session ID.
4. Review the extracted MCQs and select the correct answer for each question before saving. PDF text extraction does not reliably identify yellow-highlighted answers, so verify the answer key.
5. Set each student's allotment to 30 or 45 questions. The portal randomly draws that many questions from the combined session bank, so the bank must contain at least that many questions.
6. Share the exact registered name, session ID and access key with the student.

The student can then use **Student login** at the top right.

## Student workflow

1. Enter registered name, session ID and access key.
2. Confirm displayed details.
3. Tick the consent checkbox.
4. Select **Enable camera & start exam** and allow browser camera permission.
5. Answer questions, navigate with Previous/Next or the question palette.
6. Submit on the final question or let the timer reach zero.
7. The result shows score, correct/wrong/unanswered counts, time taken and answer review.

## Important prototype limitations

- This is a **static, browser-only prototype**. Student records, question banks and results are stored in that browser's `localStorage`. They do not sync between computers, browsers or the center and student devices.
- Center credentials and access keys in a frontend-only app are **not secure**. Anyone who can inspect the code or browser storage may access them. This is not suitable for high-stakes or confidential exams without a backend.
- Camera access is permission-based. This app only shows the live preview during the exam; it does not record or upload video. Browsers may stop camera access if the page is closed or permissions are revoked.
- The exam cannot prevent cheating or reliably detect a second device. It is not a complete proctoring system.
- The browser is the source of the timer; refreshing or closing the page can interrupt an attempt. For production, enforce timing and one-attempt rules on a server.
- `data/questions.example.json` is an optional example/reference file. The app's admin form saves questions to `localStorage` so it can run without a backend.

## Files

- `gtec-logo.png` — supplied G-TEC Education logo
- `index.html` — all screens and forms
- `styles.css` — responsive layout and styling
- `app.js` — logins, onboarding, MCQs, timer, camera permission and results
- `data/questions.example.json` — example question data
- PDF importing uses PDF.js from a CDN, so internet access is required while importing PDFs.

## Before real deployment

For multiple computers and dependable exam security, add a backend and database for authenticated center accounts, server-side access keys, question storage, attempt locking, authoritative timing and results. Serve the site over HTTPS. Add a privacy notice and obtain clear candidate consent for camera use.
