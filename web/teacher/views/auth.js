// Sign in / start a team / join a team.
import { h, mount, toast, field } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { View } from '../View.js';

export class AuthView extends View {
  render(root) {
    this.mode = this.mode || 'signin';
    const tabs = [['signin', 'Sign in'], ['create', 'Start a team'], ['join', 'Join a team']];
    const v = (id) => document.getElementById(id).value;
    const submit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        if (this.mode === 'signin') await api.post('/api/auth/login', { email: v('email'), password: v('password') });
        else await api.post('/api/auth/signup', {
          name: v('name'), email: v('email'), password: v('password'), schoolName: v('school'),
          teamName: this.mode === 'create' ? v('team') : undefined, inviteCode: this.mode === 'join' ? v('invite') : undefined
        });
        await this.app.signedIn();
      } catch (err) { toast(err.message, { bad: true }); btn.disabled = false; }
    };
    mount(root, h('div.wrap.narrow', { style: { paddingTop: '6vh' } },
      h('div', { style: { textAlign: 'center', marginBottom: '18px' } },
        h('div.brand', { style: { justifyContent: 'center', fontSize: '1.6rem' } }, h('span.dot', { style: { width: '40px', height: '40px', fontSize: '20px' } }, 'M'), 'MMESCHOOLS'),
        h('p.muted', 'Notes, snap-to-text, question spinning and live tests — for teachers.')),
      h('div.card',
        h('div.row', { style: { marginBottom: '14px' } }, tabs.map(([k, l]) =>
          h('button.small', { class: this.mode === k ? 'primary' : 'ghost', onclick: () => { this.mode = k; this.render(root); } }, l))),
        h('form', { onsubmit: submit },
          this.mode !== 'signin' && field('Your name', h('input#name', { required: true, autocomplete: 'name', placeholder: 'e.g. Mmenyene Udo' })),
          field('Email', h('input#email', { type: 'email', required: true, autocomplete: 'email' })),
          field('Password', h('input#password', { type: 'password', required: true, minLength: 6, autocomplete: this.mode === 'signin' ? 'current-password' : 'new-password' })),
          this.mode === 'create' && field('Team name', h('input#team', { placeholder: 'e.g. Uyo Science Teachers' })),
          this.mode === 'join' && field('Team invite code', h('input#invite', { required: true, placeholder: 'from your team owner', style: { textTransform: 'uppercase' } })),
          this.mode !== 'signin' && field('School you teach in (printed on papers)', h('input#school', { placeholder: 'e.g. Unity Secondary School' })),
          h('div', { style: { marginTop: '16px' } }, h('button.primary.big', { type: 'submit', style: { width: '100%', justifyContent: 'center' } },
            this.mode === 'signin' ? 'Sign in' : this.mode === 'create' ? 'Create team' : 'Join team'))
        ))
    ));
  }
}
