# MMESCHOOLS

**Notes, snap-to-text, one-button exam questions and live tests — for teachers, from one folder.**

MMESCHOOLS is a teaching system for a team of teachers who will one day run their own schools. A teacher keeps her notes for every subject and class. She can photograph her notebook and have it turned into text. She presses **Spin** to get a multiple-choice paper made from those notes, at the difficulty she chooses. She then runs the test live over the internet while she watches every student write.

It runs on an ordinary laptop with nothing but **Node.js**. There are no npm packages, no cloud accounts, and no outside OCR or AI service. The database, the handwriting reader, the question generator, the PDF and Word writers, the QR codes and the public link are all in this repository.

---

## What a teacher can do

### 📒 Keep notes, class by class
- Every subject × class (e.g. *Basic Science · JSS2A*) has its own notebook, grouped by topic.
- Write notes, import a Word file, or snap a page.
- Every save is versioned, and an earlier version can be restored.
- Search across all your notes.
- Share a note with your team; colleagues can copy it into their own classes.

### 📷 Snap a notebook page → text
- Take or choose a photo. Drag the corner dots if the page edge was missed.
- The phone reads the page. Words it was unsure of are highlighted, with suggested alternatives.
- Check it word by word, then save it as a note or add it to an existing one.
- **Every word you fix teaches your personal handwriting model.** Re-training runs in the background on the computer. A new model is only switched on if it reads your held-back letters better than the old one.

### 🎡 Spin exam questions
- Choose how many questions, the **easy / medium / hard** mix, which notes to read, and which kinds of question.
- Ten kinds of question:

  | | |
  |---|---|
  | Name it | Odd one out |
  | What it is | Tell them apart |
  | Fill the gap | Apply it |
  | The right figure | Right order |
  | Which is true | Cause and effect |

- **Lock** the questions you like and spin again for the rest. You can also re-spin, edit or reject a single question; a rejected one is never offered again.
- Wrong options are never made up. They come from elsewhere in *your* notes, filtered so that none is accidentally right and that length doesn't give the answer away.
- Save questions to a per-class **question bank** for reuse.

### 🧑‍🎓 Live tests over the internet
- Opening a test gives a 6-character **code**, a **link** and a **QR code** to project or share on WhatsApp.
- Students open it on any phone or laptop and type their name.
  - One question per screen, with a timer kept by the server.
  - Every tap is saved, and a refresh picks up where they left off.
- Results appear **straight away** or **when the teacher presses Release** (chosen per test). Students see their score, the corrections, and the line in the notes each answer came from.
- Marking happens on the server. The answer key never reaches a student's phone before results are released.

### 👀 Live Watch
- One row per student: progress, right so far, current question, time left, *left the page* and *idle* flags, result.
- A colour grid shows which questions the class is missing. Tap a question to see which wrong option the class is choosing.
- Add time for one student or everyone; rename or remove a student; close the test; release results.
- After each test, every bank question's difficulty is updated from what actually happened.

### 📤 Share as PDF or Word
- Any note, question paper, answer key or result sheet can be shared as **PDF or .docx**, through the phone's or laptop's own share menu (WhatsApp, Telegram, Gmail, Bluetooth, Drive…).
- Papers come in **Version A / B / C** (different question and option order), so neighbours can't copy.
- Where a browser can't share files, there is a download, a 24-hour link, or a WhatsApp message with the link.

---

## Quick start

**You need:** [Node.js](https://nodejs.org) **22.13 or newer** (it has the built-in SQLite this uses).

```bash
git clone https://github.com/Degadfada/MMESCHOOLS.git
cd MMESCHOOLS
```

**Windows:** double-click **`start.bat`**.
**Any system:** `npm start` (or `node launch.js`).

The window prints:

| Address | For |
|---|---|
| `http://localhost:5080` | this computer |
| `http://192.168.x.x:5080` | phones on the same Wi-Fi / hotspot |
| `https://<random>.trycloudflare.com` | **phones anywhere**: share this with students |

On first start the official `cloudflared` binary is downloaded once into `bin/`. Without internet, everything still works on the computer and the local Wi-Fi.

The public link changes each time it starts; test **codes** don't, and the test page always shows the current link and QR. To run without a public link: `node server.js`.

### First five minutes
1. Open the app → **Start a team**. Colleagues choose **Join a team** with the invite code (☰ → Team).
2. **+ Add a class**, then add notes: write, import a Word file, or **📷 Snap**.
3. **🎡 Spin questions** → set the mix → **Spin** → lock, re-spin, edit → **Make a test**.
4. **▶ Open test** → share the link or show the QR → watch it live.
5. **Release results**, then **Share results** or **Download CSV**.

### Notes that spin well
```text
# Photosynthesis
Photosynthesis is the process by which green plants make their own food using sunlight.
Chlorophyll – the green pigment in leaves that traps energy from sunlight.
The raw materials of photosynthesis are:
- carbon dioxide
- water
- sunlight
Steps in blood clotting
1. Platelets gather at the wound
2. Fibrinogen changes to fibrin threads
3. A clot forms and seals the wound
Plants make their own food because they contain chlorophyll.
An adult human skeleton has 206 bones.
```
Headings (`#`), definitions (`X is…`, `X – …`, `… is called X`), lists under a `…:` line, numbered steps, causes (`because`, `leads to`) and figures all become different kinds of question.

---

## How it is built

Object-oriented ES modules in three packages, wired together in one place, `mme/App.js`:

```
mme/        the kernel — anything a school product needs
  http/       server, router, controller base, static files
  store/      node:sqlite database, migrations, repository base
  auth/       scrypt passwords, sessions, route guard
  events/     live channels (Server-Sent Events + polling fallback)
  net/        Cloudflare tunnel, QR-code encoder
  docs/       document model → PDF writer, DOCX writer, ZIP reader/writer
  text/       text normalising, stemming, seeded random
  ocr/        the handwriting reader (runs in the browser and in Node)

mmenyene/   the teacher's workspace
  notebook/   classes, notes, versions, Word import
  snap/       scans, harvesting corrections, personal-model training (worker thread)
  forge/      Comprehender → atoms → 10 question templates → difficulty → Spin
  bank/       the question bank
  share/      exports for the Share button

edimek/     the exam hall
  TestService, Sitting, Grader, ReleasePolicy (Instant | OnRelease),
  LiveWatch, ItemAnalytics

web/        teacher app + student app (plain HTML/CSS/JS, no build step)
tools/      training, evaluation and simulation scripts
tests/      node:test unit tests
```

### The Question Forge
1. `Comprehender` reads notes into **atoms**: definitions, facts, lists, sequences, cause-and-effect.
2. Each `QuestionTemplate` subclass builds a question from an atom twice: with **near** distractors (neighbours from the same topic, hard to tell apart) and **far** ones (easy to rule out). This gives the same knowledge at different difficulties.
3. `DifficultyModel` predicts difficulty (1–5) from:
   - the Bloom level
   - how close the distractors are
   - topic overlap
   - how rare the vocabulary is
   - whether the answer stands out by length
4. **Spin** fills the requested mix, spreads across topics, uses each fact once and varies the question kinds. A seed makes every paper reproducible.
5. After a test, `ItemAnalytics` folds in the real p-value and discrimination, so difficulty labels get truer with use.

### The handwriting reader (`mme/ocr/`)
- **Page:**
  1. find the sheet and correct its perspective
  2. flatten shadows
  3. Sauvola binarisation
  4. remove ruled and margin lines (even when the photo breaks them into dashes)
  5. deskew
- **Layout:** connected components → lines → words → candidate cuts inside joined-up writing.
- **Reading:**
  - A small convolutional network (about 65k weights, plain JavaScript) scores each candidate letter. It includes a *"not a letter"* class, so bad cuts are rejected.
  - A beam search picks the best way to cut each word, guided by a character trigram model and a word list. The teacher's own notes are weighted heavily in that list.
  - Mid-sized gaps are treated as optional spaces and settled by which reading makes real words.
- **Learning:**
  - Confirmed and corrected words give labelled letters.
  - The *wrong* cuts the reader considered are also known now, so they become real "not a letter" examples in her hand.
  - Fine-tuning mixes in seed data so printed letters aren't forgotten.
- **Starting model:** trained from handwriting-style fonts on the PC (`tools/train-seed.js`), via a TrueType parser and rasteriser in `mme/ocr/synth/`. Real handwriting from NIST's EMNIST can be added (`tools/fetch-emnist.js`).

---

## Tools

```bash
npm test                                         # unit tests: forge, documents, OCR maths
node tools/simulate-class.js --selftest          # 30 pretend students sit a test; every total is checked
node tools/simulate-class.js --code ABC123       # pretend class joins YOUR open test (watch it live)
node tools/ocr-eval.js --pages 6                 # character / word error rate on synthetic notebook pages
node tools/ocr-learn-sim.js --teach 6            # does correcting pages teach an unseen hand?
node tools/train-seed.js [--emnist]              # re-train the starting handwriting model
node tools/fetch-emnist.js                       # add EMNIST real handwriting (~560 MB download, once)
```

## Current status (v0.1)

**Works end to end:**
- signup, classes and notes
- Spin, the question bank and tests
- live watch, release and results
- PDF/DOCX/CSV sharing
- snap → read → correct → save
- personal model re-training
- the public Cloudflare link

All of this was tested in a real browser and with a simulated class of 30.

**Honest numbers for the reader:**
- On synthetic notebook pages in neat handwriting-style fonts, the starting model gets about **13% of characters and 32% of words** wrong. A page takes about 2–5 s on a modest laptop.
- Printed pages read better. Real joined-up handwriting will start worse and improves as pages are corrected. The word-by-word check screen is there for that reason.
- It has not yet been measured on real notebook photos.

**Known limits:**
- The free tunnel address changes on each start. A fixed address (e.g. `test.yourschool.com`) needs a Cloudflare account and a named tunnel.
- Students identify themselves by name. Duplicate names are refused, and the teacher can rename or remove anyone.
- Data lives in `data/mmeschools.db` on the computer running it. Back up from ☰ → Team → *Back up now*.
- The phone's share menu needs a secure page: the public link or `localhost`. On plain local Wi-Fi addresses, files download instead.

## Roadmap
- Measure and tune the reader on real notebook photos; per-subject vocabularies.
- Named tunnel / fixed school address.
- Class rosters, term reports, school-wide analytics (`orgs.type = 'school'`).
- Question types beyond multiple choice (short answer, matching).
