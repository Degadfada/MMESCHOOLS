// Write or edit a note. Plain text with two light conventions the spinner understands:
// "# Heading" starts a topic section, "- item" makes a list.
import { h, mount, toast, confirmBox, modal, fmtDate } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { ShareSheet } from '../../shared/share.js';
import { View } from '../View.js';

export class NoteView extends View {
  async render(root) {
    const t = await this.app.teaching(this.params.tid);
    const isNew = this.params.nid === 'new';
    const n = isNew ? { title: '', topic: '', body: '', shared: false } : await api.get(`/api/notes/${this.params.nid}`);
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: `${t.subject} · ${t.class_name}`, href: `#/c/${t.id}` }, { label: isNew ? 'New note' : n.title }]);
    const title = h('input', { value: n.title, placeholder: 'Title, e.g. Photosynthesis', disabled: n.readonly });
    const topic = h('input', { value: n.topic, placeholder: 'Topic (groups notes), e.g. Living things', disabled: n.readonly });
    const body = h('textarea', { value: n.body, disabled: n.readonly, style: { minHeight: '55vh' },
      placeholder: '# Photosynthesis\nPhotosynthesis is the process by which green plants make their own food using sunlight.\nThe raw materials of photosynthesis are:\n- carbon dioxide\n- water\n- sunlight' });
    const shared = h('input', { type: 'checkbox', checked: !!n.shared, disabled: n.readonly });
    this.dirty = false;
    for (const el of [title, topic, body]) el.addEventListener('input', () => { this.dirty = true; status.textContent = 'Not saved'; });
    const status = h('span.muted', isNew ? '' : `Saved ${fmtDate(n.updated || n.created)}`);

    const save = async () => {
      try {
        const payload = { title: title.value, topic: topic.value, body: body.value, shared: shared.checked };
        const saved = isNew ? await api.post('/api/notes', { teachingId: t.id, ...payload }) : await api.put(`/api/notes/${n.id}`, payload);
        this.dirty = false; status.textContent = 'Saved'; this.app.forget();
        if (isNew) location.replace(`#/c/${t.id}/note/${saved.id}`);
        return saved;
      } catch (e) { toast(e.message, { bad: true }); return null; }
    };
    // Autosave a few seconds after typing stops, for existing notes.
    if (!isNew && !n.readonly) this.every(4000, () => { if (this.dirty) save(); });
    this.onDestroy = () => { if (this.dirty && !isNew) save(); };

    mount(root,
      n.readonly && h('div.card', { style: { background: 'var(--brand-soft)' } }, `Shared by ${n.teacher_name}. Copy it to your notes to change it.`),
      h('div.card.stack',
        h('div.row', h('div', { style: { flex: '2 1 240px' } }, title), h('div', { style: { flex: '1 1 180px' } }, topic)),
        body,
        h('div.row.between',
          h('label.check', shared, 'Share with my team'),
          h('div.row', status,
            !isNew && h('button.ghost.small', { onclick: () => this.history(n) }, 'History'),
            !isNew && !n.readonly && h('button.ghost.small.danger', { onclick: async () => {
              if (await confirmBox('Delete note', `Delete “${n.title}”? This cannot be undone.`, 'Delete')) { await api.del(`/api/notes/${n.id}`); this.dirty = false; this.app.forget(); this.app.go(`#/c/${t.id}`); }
            } }, 'Delete'),
            !isNew && h('button', { onclick: async () => { if (this.dirty) await save(); new ShareSheet({ title: title.value || 'Note', build: ({ fmt }) => api.file(`/api/export/note/${n.id}?fmt=${fmt}`), linkSpec: { kind: 'note', id: n.id } }).open(); } }, 'Share'),
            !n.readonly && h('button.primary', { onclick: save }, 'Save')))),
      h('p.muted', { style: { fontSize: '.85rem' } }, 'Tips for better questions: start sections with “# Heading”; write definitions as “Term is …” or “Term – …”; put lists under a line ending with “:”; number the steps of a process.')
    );
  }

  async history(n) {
    const versions = await api.get(`/api/notes/${n.id}/versions`);
    modal('Earlier versions', (close) => h('div.list', versions.map((v, i) => h('div.item',
      h('div.main', h('div.title', fmtDate(v.created)), h('div.sub', `${v.length} characters${i === 0 ? ' · current' : ''}`)),
      i > 0 && !n.readonly && h('button.small', { onclick: async () => { await api.post(`/api/notes/${n.id}/restore`, { versionId: v.id }); close(); toast('Restored'); this.app.route(); } }, 'Restore')))));
  }
}
