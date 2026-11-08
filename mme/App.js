// mme/App.js — the composition root. Builds every repository, service and controller
// once and wires them together; nothing else in the code base does `new` on a service.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from './store/Database.js';
import { MIGRATIONS } from './store/schema.js';
import { Server } from './http/Server.js';
import { PasswordHasher } from './auth/PasswordHasher.js';
import { SessionManager } from './auth/SessionManager.js';
import { Guard } from './auth/Guard.js';
import { LiveHub } from './events/LiveChannel.js';

import { OrgRepo } from '../mmenyene/repos/OrgRepo.js';
import { TeacherRepo } from '../mmenyene/repos/TeacherRepo.js';
import { SubjectRepo } from '../mmenyene/repos/SubjectRepo.js';
import { ClassRoomRepo } from '../mmenyene/repos/ClassRoomRepo.js';
import { TeachingRepo } from '../mmenyene/repos/TeachingRepo.js';
import { NoteRepo } from '../mmenyene/repos/NoteRepo.js';
import { QuestionRepo } from '../mmenyene/repos/QuestionRepo.js';
import { ScanRepo } from '../mmenyene/repos/ScanRepo.js';
import { OcrSampleRepo } from '../mmenyene/repos/OcrSampleRepo.js';
import { OcrModelRepo } from '../mmenyene/repos/OcrModelRepo.js';
import { AccountService } from '../mmenyene/AccountService.js';
import { NotebookService } from '../mmenyene/notebook/NotebookService.js';
import { DocxImporter } from '../mmenyene/notebook/DocxImporter.js';
import { ForgeService } from '../mmenyene/forge/ForgeService.js';
import { QuestionBank } from '../mmenyene/bank/QuestionBank.js';
import { ExportService } from '../mmenyene/share/ExportService.js';
import { ScanService } from '../mmenyene/snap/ScanService.js';
import { AuthController } from '../mmenyene/controllers/AuthController.js';
import { NotebookController } from '../mmenyene/controllers/NotebookController.js';
import { ForgeController } from '../mmenyene/controllers/ForgeController.js';
import { ShareController } from '../mmenyene/controllers/ShareController.js';
import { SystemController } from '../mmenyene/controllers/SystemController.js';
import { ScanController } from '../mmenyene/controllers/ScanController.js';

import { TestRepo } from '../edimek/repos/TestRepo.js';
import { AttemptRepo } from '../edimek/repos/AttemptRepo.js';
import { ResponseRepo } from '../edimek/repos/ResponseRepo.js';
import { TestService } from '../edimek/TestService.js';
import { Sitting } from '../edimek/Sitting.js';
import { LiveWatch } from '../edimek/LiveWatch.js';
import { ItemAnalytics } from '../edimek/ItemAnalytics.js';
import { TestController } from '../edimek/controllers/TestController.js';
import { StudentController } from '../edimek/controllers/StudentController.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class App {
  constructor({ port = 5080, dataDir = path.join(ROOT, 'data'), dbFile, log = console } = {}) {
    this.port = port;
    this.dataDir = dataDir;
    this.log = log;
    this.tunnel = null;

    // ── storage ──
    this.db = new Database(dbFile || path.join(dataDir, 'mmeschools.db'));
    this.db.migrate(MIGRATIONS);
    const db = this.db;
    this.repos = {
      orgs: new OrgRepo(db), teachers: new TeacherRepo(db), subjects: new SubjectRepo(db),
      classrooms: new ClassRoomRepo(db), teachings: new TeachingRepo(db), notes: new NoteRepo(db),
      questions: new QuestionRepo(db), scans: new ScanRepo(db), samples: new OcrSampleRepo(db),
      models: new OcrModelRepo(db), tests: new TestRepo(db), attempts: new AttemptRepo(db), responses: new ResponseRepo(db)
    };
    const r = this.repos;

    // ── services ──
    this.sessions = new SessionManager(db);
    this.accounts = new AccountService({ orgs: r.orgs, teachers: r.teachers, hasher: new PasswordHasher(), sessions: this.sessions });
    this.notebook = new NotebookService({ subjects: r.subjects, classrooms: r.classrooms, teachings: r.teachings, notes: r.notes, docx: new DocxImporter() });
    this.forge = new ForgeService({ notebook: this.notebook, notes: r.notes, questions: r.questions });
    this.bank = new QuestionBank({ questions: r.questions, notebook: this.notebook });
    this.hub = new LiveHub();
    this.analytics = new ItemAnalytics({ questions: r.questions });
    this.live = new LiveWatch({ hub: this.hub, attempts: r.attempts, responses: r.responses, analytics: this.analytics });
    this.tests = new TestService({ tests: r.tests, attempts: r.attempts, responses: r.responses, bank: this.bank, notebook: this.notebook, live: this.live, analytics: this.analytics });
    this.sitting = new Sitting({ tests: r.tests, attempts: r.attempts, responses: r.responses, live: this.live, testService: this.tests, notebook: this.notebook });
    this.scan = new ScanService({ scans: r.scans, samples: r.samples, models: r.models, notebook: this.notebook, dataDir, log });
    this.exporter = new ExportService({ notebook: this.notebook, bank: this.bank, testService: this.tests, scans: r.scans, orgs: r.orgs, dataDir });

    // ── http ──
    this.server = new Server({ port, log });
    this.server.use(new Guard(this.sessions, r.teachers).middleware());
    const controllers = [AuthController, NotebookController, ForgeController, ShareController, SystemController, ScanController, TestController, StudentController];
    for (const C of controllers) new C(this).register(this.server.router);

    const web = path.join(ROOT, 'web');
    this.server.static
      .mount('/static/', web)
      .mount('/mme/ocr/', path.join(ROOT, 'mme', 'ocr'))
      .mount('/mme/text/', path.join(ROOT, 'mme', 'text'))
      .mount('/models/', path.join(dataDir, 'models'));
    this.server
      .page('/t/', path.join(web, 'student', 'index.html'))
      .page('/', path.join(web, 'teacher', 'index.html'))
      .page('/app/', path.join(web, 'teacher', 'index.html'))
      .page('/live/', path.join(web, 'teacher', 'index.html'));
  }

  async start() {
    await this.server.listen();
    this.sweeper = setInterval(() => { try { this.tests.sweep(); } catch (e) { this.log.error('[sweep]', e); } }, 5000);
    return this;
  }

  attachTunnel(tunnel) { this.tunnel = tunnel; return this; }

  async stop() {
    clearInterval(this.sweeper);
    if (this.tunnel) this.tunnel.stop();
    await this.server.close();
    this.db.close();
  }
}
