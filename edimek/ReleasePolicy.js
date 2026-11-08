// edimek/ReleasePolicy.js — when may a student see their result? (strategy pattern)

export class ReleasePolicy {
  static for(test) { return test.release_mode === 'on-release' ? new OnRelease() : new Instant(); }
  get mode() { return 'base'; }
  // eslint-disable-next-line no-unused-vars
  visible(test, attempt) { return false; }
  waitingMessage() { return ''; }
}

/** Each student sees their result as soon as they submit. */
export class Instant extends ReleasePolicy {
  get mode() { return 'instant'; }
  visible(test, attempt) { return !!(attempt && attempt.finished); }
}

/** Everyone waits; the teacher presses Release and all results appear together. */
export class OnRelease extends ReleasePolicy {
  get mode() { return 'on-release'; }
  visible(test, attempt) { return !!(attempt && attempt.finished && test.released_at); }
  waitingMessage() { return 'Your answers are in. Your teacher will release the results soon — keep this page open.'; }
}
