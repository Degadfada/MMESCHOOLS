// edimek/controllers/StudentController.js — what a student's phone talks to.
// Public routes, scoped by test code and the device cookie.
import { Controller } from '../../mme/http/Controller.js';
import { Sitting } from '../Sitting.js';

export class StudentController extends Controller {
  routes() {
    const o = { auth: 'public' };
    return [
      ['GET', '/api/t/:code', 'info', o],
      ['POST', '/api/t/:code/join', 'join', o],
      ['GET', '/api/t/:code/paper', 'paper', o],
      ['POST', '/api/t/:code/answer', 'answer', o],
      ['POST', '/api/t/:code/view', 'view', o],
      ['POST', '/api/t/:code/finish', 'finish', o],
      ['GET', '/api/t/:code/result', 'result', o]
    ];
  }

  device(req, res) {
    let d = req.cookies[Sitting.COOKIE];
    if (!d || d.length < 16) {
      d = Sitting.newDevice();
      res.setCookie(Sitting.COOKIE, d, { maxAge: 180 * 24 * 3600, secure: req.isSecure });
      req.cookies[Sitting.COOKIE] = d;
    }
    return d;
  }

  get s() { return this.app.sitting; }

  info(req, res) { return this.s.info(req.params.code, this.device(req, res)); }
  async join(req, res) {
    const { attempt, resumed } = this.s.join(req.params.code, this.device(req, res), (await req.json()).name);
    return { ok: true, resumed, name: attempt.student_name };
  }
  paper(req, res) { return this.s.paper(req.params.code, this.device(req, res)); }
  async answer(req, res) { return this.s.answer(req.params.code, this.device(req, res), await req.json()); }
  async view(req, res) { return this.s.view(req.params.code, this.device(req, res), await req.json()); }
  finish(req, res) { return this.s.finish(req.params.code, this.device(req, res)); }
  result(req, res) { return this.s.result(req.params.code, this.device(req, res)); }
}
