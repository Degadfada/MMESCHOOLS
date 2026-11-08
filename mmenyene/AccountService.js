// mmenyene/AccountService.js — teams and teachers. The first teacher creates a team
// (and becomes its owner); colleagues join with the team's invite code.
import { HttpError } from '../mme/http/Request.js';
import { TeacherRepo } from './repos/TeacherRepo.js';

export class AccountService {
  constructor({ orgs, teachers, hasher, sessions }) {
    Object.assign(this, { orgs, teachers, hasher, sessions });
  }

  validate({ name, email, password }) {
    if (!name || String(name).trim().length < 2) throw new HttpError(400, 'please give your name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim())) throw new HttpError(400, 'please give a valid email');
    if (!password || String(password).length < 6) throw new HttpError(400, 'password must be at least 6 characters');
    if (this.teachers.byEmail(email)) throw new HttpError(409, 'that email already has an account — sign in instead');
  }

  signup({ name, email, password, teamName, inviteCode, schoolName }) {
    this.validate({ name, email, password });
    let org, role;
    if (inviteCode) {
      org = this.orgs.byInvite(inviteCode);
      if (!org) throw new HttpError(404, 'no team has that invite code');
      role = 'teacher';
    } else {
      org = this.orgs.insert({ name: String(teamName || `${name}'s team`).trim(), type: 'team', invite_code: this.orgs.newInviteCode() });
      role = 'owner';
    }
    const teacher = this.teachers.insert({
      org_id: org.id, name: String(name).trim(), email: String(email).trim().toLowerCase(),
      pass_hash: this.hasher.hash(password), role, school_name: schoolName ? String(schoolName).trim() : null
    });
    return { teacher: TeacherRepo.public(teacher), token: this.sessions.create(teacher.id) };
  }

  login({ email, password }) {
    const t = this.teachers.byEmail(email);
    if (!t || !this.hasher.verify(password, t.pass_hash)) throw new HttpError(401, 'email or password is not right');
    return { teacher: TeacherRepo.public(t), token: this.sessions.create(t.id) };
  }

  me(teacher) {
    const org = this.orgs.find(teacher.org_id);
    return {
      teacher: TeacherRepo.public(teacher),
      org: { id: org.id, name: org.name, type: org.type, invite_code: org.invite_code },
      colleagues: this.teachers.inOrg(org.id)
    };
  }

  updateProfile(teacher, { name, school_name }) {
    return TeacherRepo.public(this.teachers.update(teacher.id, {
      name: name ? String(name).trim() : undefined,
      school_name: school_name !== undefined ? String(school_name).trim() : undefined
    }));
  }
}
