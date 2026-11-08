// mme/docs/Renderer.js — base class for document renderers.

export class Renderer {
  get mime() { throw new Error('mime not set'); }
  get ext() { throw new Error('ext not set'); }
  /** @param {import('./DocModel.js').DocModel} doc @returns {Buffer} */
  // eslint-disable-next-line no-unused-vars
  render(doc) { throw new Error('render() not implemented'); }

  static for(fmt) {
    // Lazy to avoid a cycle; both subclasses import this file.
    return fmt === 'docx' ? Renderer.registry.docx() : Renderer.registry.pdf();
  }
}
Renderer.registry = {};
