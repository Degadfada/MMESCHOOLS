// web/shared/share.js — the Share button. Opens the phone's or computer's own share
// sheet (WhatsApp, Telegram, Gmail, Bluetooth, Drive…) with a real PDF or Word file.
// Where a browser cannot share files, falls back to download, a copyable link, and a
// WhatsApp message carrying that link.
import { h, modal, toast } from './dom.js';
import { api } from './api.js';

export class ShareSheet {
  /**
   * @param title     what is being shared ("JSS2A Basic Science test")
   * @param build     async (fmt) => File          — fetches the file
   * @param linkSpec  {kind, id, params} or null   — for the link fallback
   * @param variants  optional [{label, value}] e.g. paper / key / both
   */
  constructor({ title, build, linkSpec = null, variants = null, versions = false }) {
    Object.assign(this, { title, build, linkSpec, variants, versions });
  }

  static canShareFiles() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }));
    } catch { return false; }
  }

  open() {
    let fmt = 'pdf', variant = this.variants ? this.variants[0].value : null, version = 'A';
    const busy = (b, btn) => { btn.disabled = b; };
    const choose = (opts, cur, set) => h('div.row', opts.map(o => {
      const b = h('button.small', { class: o.value === cur() ? 'primary' : '', onclick: () => { set(o.value); b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('primary', x === b)); } }, o.label);
      return b;
    }));
    modal('Share ' + this.title, (close) => {
      const shareBtn = h('button.primary.big', { style: { width: '100%', justifyContent: 'center' } }, ShareSheet.canShareFiles() ? 'Share…' : 'Download');
      shareBtn.onclick = async () => {
        busy(true, shareBtn);
        try {
          const file = await this.build({ fmt, variant, version });
          await ShareSheet.deliver(file, this.title);
          close();
        } catch (e) { if (e.name !== 'AbortError') toast(e.message, { bad: true }); }
        finally { busy(false, shareBtn); }
      };
      const extra = [];
      if (this.linkSpec) {
        extra.push(h('button', { onclick: async () => {
          try {
            const l = await api.post('/api/share/link', { ...this.linkSpec, params: { ...(this.linkSpec.params || {}), fmt, variant, version } });
            const url = location.origin + l.path;
            await ShareSheet.copy(url);
            toast('Link copied — it works for 24 hours');
          } catch (e) { toast(e.message, { bad: true }); }
        } }, '🔗 Copy a link'));
        extra.push(h('button', { onclick: async () => {
          try {
            const l = await api.post('/api/share/link', { ...this.linkSpec, params: { ...(this.linkSpec.params || {}), fmt, variant, version } });
            window.open('https://wa.me/?text=' + encodeURIComponent(`${this.title}: ${location.origin + l.path}`), '_blank');
          } catch (e) { toast(e.message, { bad: true }); }
        } }, 'WhatsApp link'));
      }
      return h('div.stack',
        h('label', 'Format'),
        choose([{ label: 'PDF', value: 'pdf' }, { label: 'Word (.docx)', value: 'docx' }], () => fmt, v => { fmt = v; }),
        this.variants && h('label', 'What to include'),
        this.variants && choose(this.variants, () => variant, v => { variant = v; }),
        this.versions && h('label', 'Version (different question order, so neighbours can’t copy)'),
        this.versions && choose(['A', 'B', 'C'].map(v => ({ label: v, value: v })), () => version, v => { version = v; }),
        h('hr'),
        shareBtn,
        extra.length && h('div.row', { style: { justifyContent: 'center' } }, extra),
        h('p.muted', { style: { fontSize: '.85rem', textAlign: 'center', margin: 0 } },
          ShareSheet.canShareFiles() ? 'Choose WhatsApp, Telegram, Gmail, Bluetooth… from your device’s share menu.' : 'This browser cannot share files directly, so the file will download. You can also copy a link.')
      );
    });
  }

  static async deliver(file, title) {
    if (ShareSheet.canShareFiles() && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text: title });
      return;
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Downloaded ' + file.name);
  }

  /** Share plain text + link (e.g. the test link) through the device's share sheet. */
  static async shareText(title, text, url) {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    await ShareSheet.copy(url ? `${text} ${url}` : text);
    toast('Copied — paste it into WhatsApp or SMS');
  }

  static async copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } });
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
  }
}
