// edimek/ItemAnalytics.js — what the class's answers say about each question.
//   p-value        share of students who got it right (low = hard)
//   discrimination did the strongest 27% get it right more often than the weakest 27%?
//                  (near zero or negative = a question to look at again)
//   choices        how many picked each option — a popular wrong option is a misconception.
// When a test is closed, each bank question's observed difficulty is updated.
import { DifficultyModel } from '../mmenyene/forge/DifficultyModel.js';

export class ItemAnalytics {
  constructor({ questions }) { this.questions = questions; }

  compute(test, attempts, responses) {
    const finished = attempts.filter(a => a.finished);
    const byAttempt = new Map();
    for (const r of responses) {
      if (!byAttempt.has(r.attempt_id)) byAttempt.set(r.attempt_id, new Map());
      byAttempt.get(r.attempt_id).set(r.qid, r);
    }
    const ranked = finished.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const k = Math.max(1, Math.round(ranked.length * 0.27));
    const top = new Set(ranked.slice(0, k).map(a => a.id)), bottom = new Set(ranked.slice(-k).map(a => a.id));

    return test.paper.map(q => {
      const choices = q.options.map(() => 0);
      let answered = 0, correct = 0, topRight = 0, bottomRight = 0;
      for (const a of attempts) {
        const r = byAttempt.get(a.id)?.get(q.qid);
        if (!r || r.choice == null) continue;
        answered++;
        choices[r.choice] = (choices[r.choice] || 0) + 1;
        if (r.correct) {
          correct++;
          if (top.has(a.id)) topRight++;
          if (bottom.has(a.id)) bottomRight++;
        }
      }
      const p = answered ? correct / answered : null;
      const disc = ranked.length >= 4 ? (topRight - bottomRight) / k : null;
      let worst = null;
      choices.forEach((n, i) => { if (i !== q.answer && n > 0 && (!worst || n > worst.n)) worst = { option: i, n }; });
      return { qid: q.qid, bankId: q.bankId || null, stem: q.stem, topic: q.topic, answer: q.answer, options: q.options,
        answered, correct, p, discrimination: disc, choices, commonWrong: worst };
    });
  }

  /** Fold this sitting into each bank question's observed difficulty. */
  commit(items) {
    for (const it of items) {
      if (!it.bankId || !it.answered) continue;
      const q = this.questions.find(it.bankId);
      if (!q) continue;
      const prevN = q.sittings || 0;
      const obs = DifficultyModel.fromPValue(it.p);
      const merged = q.difficulty_obs == null ? obs : (q.difficulty_obs * prevN + obs * it.answered) / (prevN + it.answered);
      this.questions.update(q.id, { difficulty_obs: Math.round(merged * 10) / 10, sittings: prevN + it.answered });
    }
  }
}
