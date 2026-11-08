// One class's notebook: notes grouped by topic, colleagues' shared notes, and the
// doors to Snap, Spin (forge), the question bank and tests.
import { h, mount, toast, fmtDate, confirmBox } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { ShareSheet } from '../../shared/share.js';
import { View } from '../View.js';

export class NotebookView extends View {
  async render(root) {
    const { teaching: t, notes, shared } = await api.get(`/api/teachings/${this.params.tid}/notes`);
    this.app.cache.set('t' + t.id, t);
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: `${t.subject} · ${t.class_name}` }]);
    const byTopic = new Map();
    for (const n of notes) {
      const k = n.topic || 'General';
      if (!byTopic.has(k)) byTopic.set(k, []);
      byTopic.get(k).push(n);
    }
    const fileIn = h('input', { type: 'file', accept: '.docx', class: 'hide', onchange: () => this.importDocx(fileIn.files[0]) });
    mount(root,
      h('div.row.between',
        h('div', h('h1', t.subject), h('p.muted', `${t.class_name} · ${notes.length} notes · ${t.question_count} questions in the bank`)),
        h('div.row',
          h('a.btn.primary', { href: `#/c/${t.id}/forge` }, '🎡 Spin questions'),
          h('a.btn', { href: `#/c/${t.id}/bank` }, 'Question bank'))),
      h('div.row', { style: { margin: '12px 0' } },
        h('a.btn', { href: `#/c/${t.id}/note/new` }, '✎ Write a note'),
        h('a.btn', { href: `#/c/${t.id}/snap` }, '📷 Snap notebook pages'),
        h('button', { onclick: () => fileIn.click() }, '⇪ Import Word file'), fileIn),
      notes.length === 0 && h('div.card.empty', h('h2', 'No notes yet'),
        h('p', 'Write a note, snap a page of your notebook, or import a Word file. The question spinner reads these notes.')),
      [...byTopic].map(([topic, list]) => h('div',
        h('div.section', h('h3', topic)),
        h('div.card', h('div.list', list.map(n => h('div.item',
          h('a.main.clickable', { href: `#/c/${t.id}/note/${n.id}` },
            h('div.title', n.title, n.source === 'ocr' ? h('span.badge', { style: { marginLeft: '6px' } }, 'snapped') : null, n.shared ? h('span.badge', { style: { marginLeft: '6px' } }, 'shared') : null),
            h('div.sub', `${fmtDate(n.updated || n.created)} — ${(n.preview || '').replace(/[#\-*]\s?/g, '').replace(/\s+/g, ' ')}`)),
          h('button.small.ghost', { title: 'Share', onclick: () => this.share(n) }, 'Share'))))))),
      shared.length > 0 && h('div',
        h('div.section', h('h3', 'Shared by colleagues')),
        h('div.card', h('div.list', shared.map(n => h('div.item',
          h('div.main', h('div.title', n.title), h('div.sub', `${n.teacher_name} · ${n.class_name} — ${n.preview.replace(/\s+/g, ' ')}`)),
          h('button.small', { onclick: () => this.copy(n.id, t.id) }, 'Copy to my notes'))))))
    );
  }

  share(n) {
    new ShareSheet({
      title: n.title,
      build: ({ fmt }) => api.file(`/api/export/note/${n.id}?fmt=${fmt}`),
      linkSpec: { kind: 'note', id: n.id }
    }).open();
  }

  async copy(noteId, tid) {
    try { const n = await api.post(`/api/notes/${noteId}/copy`, { teachingId: tid }); toast('Copied'); this.app.go(`#/c/${tid}/note/${n.id}`); }
    catch (e) { toast(e.message, { bad: true }); }
  }

  async importDocx(file) {
    if (!file) return;
    if (!(await confirmBox('Import', `Import “${file.name}” as a new note?`, 'Import'))) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    try {
      const n = await api.post('/api/notes/import-docx', { teachingId: Number(this.params.tid), filename: file.name, base64: btoa(bin) });
      toast('Imported'); this.app.go(`#/c/${this.params.tid}/note/${n.id}`);
    } catch (e) { toast(e.message, { bad: true }); }
  }
}
