// web/shared/api.js — JSON calls to the server with readable errors.

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const api = {
  async call(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method, credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new ApiError(0, 'No connection — check your internet and try again.');
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Something went wrong (${res.status})`);
    return data;
  },
  get(p) { return this.call('GET', p); },
  post(p, b = {}) { return this.call('POST', p, b); },
  put(p, b = {}) { return this.call('PUT', p, b); },
  del(p) { return this.call('DELETE', p); },

  /** Fetch a file (PDF/DOCX/CSV) as a File object with its server-given name. */
  async file(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let msg = `Could not make the file (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch { /* not json */ }
      throw new ApiError(res.status, msg);
    }
    const disp = res.headers.get('content-disposition') || '';
    const name = (disp.match(/filename="([^"]+)"/) || [])[1] || 'download';
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type });
  }
};
