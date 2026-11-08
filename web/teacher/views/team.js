// Team & settings: invite colleagues, my profile, sign out.
import { h, mount, toast, field } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { ShareSheet } from '../../shared/share.js';
import { View } from '../View.js';

export class TeamView extends View {
  async render(root) {
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: 'Team & settings' }]);
    const me = this.app.me = await api.get('/api/me');
    const name = h('input', { value: me.teacher.name });
    const school = h('input', { value: me.teacher.school_name || '' });
    mount(root,
      h('h1', me.org.name),
      h('div.card.stack',
        h('h2', 'Invite a colleague'),
        h('p', 'Colleagues choose “Join a team” when they sign up and type this code:'),
        h('div', h('b', { style: { fontSize: '1.8rem', letterSpacing: '.14em' } }, me.org.invite_code)),
        h('div.row', h('button', { onclick: () => ShareSheet.shareText('Join my MMESCHOOLS team', `Join my teaching team on MMESCHOOLS. Choose “Join a team” and use code ${me.org.invite_code}:`, location.origin) }, 'Share invite'))),
      h('div.card', h('h2', 'Teachers'), h('div.list', me.colleagues.map(c => h('div.item', h('div.main', h('div.title', c.name), h('div.sub', `${c.email}${c.school_name ? ' · ' + c.school_name : ''}`)), h('span.badge', c.role))))),
      h('div.card.stack',
        h('h2', 'My details'),
        field('Name', name), field('School (printed on question papers)', school),
        h('div.row', h('button.primary', { onclick: async () => { try { await api.put('/api/me', { name: name.value, school_name: school.value }); toast('Saved'); this.app.me = await api.get('/api/me'); } catch (e) { toast(e.message, { bad: true }); } } }, 'Save'),
          h('span.spacer'), h('button.danger', { onclick: () => this.app.signOut() }, 'Sign out'))),
      me.teacher.role === 'owner' && h('div.card.stack', h('h2', 'Backup'), h('p.muted', 'Saves a copy of everything (notes, questions, results) into data/backups on this computer.'),
        h('button', { onclick: async () => { try { const r = await api.post('/api/system/backup'); toast('Backup saved: ' + r.file.split(/[\\/]/).pop()); } catch (e) { toast(e.message, { bad: true }); } } }, 'Back up now'))
    );
  }
}
