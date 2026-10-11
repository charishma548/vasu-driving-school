import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ quiet: true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const app = express();
const PORT = Number(process.env.PORT || 5000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Kolkata';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const authRequired = Boolean(APP_PASSWORD);
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Hosting platforms (Render, Railway, Nginx, ...) sit behind a proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS_ORIGIN is only needed when the frontend is hosted on a different domain.
// Example: CORS_ORIGIN=https://vasu-frontend.netlify.app
const allowedOrigins = String(process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : !IS_PRODUCTION }));
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const BRANCHES = [
  { id: 'tagarapuvalasa', name: 'Tagarapuvalasa', idPrefix: 'VS-TAG' },
  { id: 'ananthapuram', name: 'Ananthapuram', idPrefix: 'VS-ANA' }
];
const VEHICLES = [
  { id: 'alto', name: 'Alto 800', trainingDays: 18, totalAmount: 5500 },
  { id: 'swift', name: 'Swift', trainingDays: 20, totalAmount: 7000 },
  { id: 'dzire', name: 'Swift Dzire', trainingDays: 20, totalAmount: 7000 }
];
const STATUSES = ['Present', 'Rescheduled'];

// Fixed training slots: 5:00 AM to 8:00 PM, every 30 minutes = 30 slots.
// The final slot is 7:30 PM – 8:00 PM. Keep this in sync with frontend/src/config.js.
const SLOTS = Array.from({ length: 30 }, (_, index) => {
  const startMinutes = 5 * 60 + index * 30;
  const endMinutes = startMinutes + 30;
  const formatTime = (minutes) => {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
  };
  return { id: `slot-${index + 1}`, start: formatTime(startMinutes), end: formatTime(endMinutes), label: `${formatTime(startMinutes)} – ${formatTime(endMinutes)}` };
});
const useMongo = Boolean(process.env.MONGODB_URI?.trim());

const StudentSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true }, branchId: String, name: String, phone: String,
  address: { type: String, default: '' }, vehicleId: String, vehicleName: String,
  requiredDays: Number, startDate: String, slotId: String, slotLabel: String, instructorName: { type: String, default: '' }, totalAmount: { type: Number, default: 0 }, advancePaid: { type: Number, default: 0 }, balanceAmount: { type: Number, default: 0 }, notes: { type: String, default: '' },
  status: { type: String, default: 'Active' }, createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
// A slot belongs to a branch + vehicle: different cars can train at the same time,
// but one car can never have two ACTIVE students in the same slot.
StudentSchema.index(
  {  vehicleId: 1, slotId: 1 },
  { unique: true, partialFilterExpression: { status: 'Active', slotId: { $type: 'string' } } }
);
const AttendanceSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true }, studentId: String, branchId: String, date: String,
  status: String, updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
// One attendance record per student per date, even with simultaneous clicks.
AttendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
const Student = mongoose.model('Student', StudentSchema);
// Remembers the last student number used per branch, so a deleted student's ID is never given out again.
const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, value: Number }, { versionKey: false }));
const Attendance = mongoose.model('Attendance', AttendanceSchema);

const uid = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toUpperCase().padEnd(8, '0');
// Today's date in the driving school's time zone (the hosting server usually runs in UTC).
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

async function readDb() {
  try { return JSON.parse(await fs.readFile(DB_FILE, 'utf8')); }
  catch (e) {
    // Only a missing file means "empty database". A corrupted file must never
    // be treated as empty, otherwise the next save would erase every record.
    if (e.code === 'ENOENT') return { students: [], attendance: [] };
    throw e;
  }
}
async function writeDb(db) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  // Write to a temporary file first so a crash can never leave a half-written database.
  const tmp = `${DB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}
// Run JSON-file read/modify/write operations one at a time so two
// simultaneous requests can never overwrite each other's changes.
let dbQueue = Promise.resolve();
function withDb(task) {
  const run = dbQueue.then(task, task);
  dbQueue = run.catch(() => {});
  return run;
}

function validBranch(id) { return BRANCHES.some(b => b.id === id); }
function validStatus(s) { return STATUSES.includes(s); }
function validDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
// Simple branch-wise student IDs:
// Tagarapuvalasa -> VS-TAG-001, VS-TAG-002, ...   Ananthapuram -> VS-ANA-001, VS-ANA-002, ...
// The number continues after the highest number ever used (including deleted
// students), so an ID is never reused.
function studentNumber(branchId, id) {
  const prefix = BRANCHES.find(b => b.id === branchId)?.idPrefix;
  const match = prefix && String(id).match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}
function nextStudentId(branchId, existingIds, lastUsed = 0) {
  const prefix = BRANCHES.find(b => b.id === branchId).idPrefix;
  const highest = existingIds.reduce((max, id) => Math.max(max, studentNumber(branchId, id)), Number(lastUsed) || 0);
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}
function publicError(res, status, message) { return res.status(status).json({ ok: false, message }); }
function statusFor(attended, requiredDays, balanceAmount = 0) {
  return attended >= Number(requiredDays) && Number(balanceAmount || 0) <= 0 ? 'Completed' : 'Active';
}
function normalizePayment(student) {
  const vehicle = VEHICLES.find(v => v.id === student.vehicleId);
  const total = Number(student.totalAmount ?? vehicle?.totalAmount ?? 0);
  const paid = Math.max(0, Math.min(total, Number(student.advancePaid ?? 0)));
  const balance = Math.max(0, total - paid);
  const changed = Number(student.totalAmount ?? 0) !== total || Number(student.advancePaid ?? 0) !== paid || Number(student.balanceAmount ?? -1) !== balance;
  student.totalAmount = total;
  student.advancePaid = paid;
  student.balanceAmount = balance;
  return changed;
}

// ---------------- Login ----------------
// Set APP_PASSWORD in backend/.env to protect the website with a password.
const tokenKey = crypto.createHash('sha256').update(`vasu-token:${APP_PASSWORD}:${process.env.AUTH_SECRET || ''}`).digest();
const sign = (value) => crypto.createHmac('sha256', tokenKey).update(value).digest('base64url');
function createToken() {
  const expires = String(Date.now() + TOKEN_TTL_MS);
  return `${expires}.${sign(expires)}`;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function validToken(token) {
  const [expires, signature] = String(token || '').split('.');
  if (!expires || !signature || !safeEqual(signature, sign(expires))) return false;
  return Number(expires) > Date.now();
}
function isLoggedIn(req) {
  if (!authRequired) return true;
  const header = req.get('authorization') || '';
  return validToken(header.startsWith('Bearer ') ? header.slice(7) : '');
}

// Basic protection against password guessing: 10 failed attempts per 15 minutes per IP.
const failedLogins = new Map();
function tooManyAttempts(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= 10;
}
function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = failedLogins.get(ip);
  if (!entry || entry.resetAt < now) failedLogins.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else entry.count += 1;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: useMongo ? 'mongodb' : 'json-file' }));
app.get('/api/session', (req, res) => res.json({ ok: true, authRequired, authenticated: isLoggedIn(req) }));
app.post('/api/login', (req, res) => {
  if (!authRequired) return res.json({ ok: true, token: '' });
  if (tooManyAttempts(req.ip)) return publicError(res, 429, 'Too many wrong attempts. Please try again after 15 minutes.');
  if (!safeEqual(req.body?.password || '', APP_PASSWORD)) {
    recordFailedLogin(req.ip);
    return publicError(res, 401, 'Wrong password.');
  }
  failedLogins.delete(req.ip);
  res.json({ ok: true, token: createToken() });
});

// Every other API route requires login.
app.use('/api', (req, res, next) => {
  if (isLoggedIn(req)) return next();
  publicError(res, 401, 'Please log in again.');
});

app.get('/api/branches', (_req, res) => res.json(BRANCHES));
app.get('/api/vehicles', (_req, res) => res.json(VEHICLES));
app.get('/api/slots', (_req, res) => res.json(SLOTS));

app.get('/api/students', async (req, res) => {
  try {
    const { branchId, search = '' } = req.query;
    if (branchId && !validBranch(branchId)) return publicError(res, 400, 'Invalid branchId.');

    // Always derive completion from attendance so an old/stale student record
    // can never remain Active after reaching the required training days.
    let students;
    if (useMongo) {
      students = await Student.find(branchId ? { branchId } : {}).sort({ createdAt: -1 }).lean();
      const ids = students.map(s => s.id);
      if (ids.length) {
        const counts = await Attendance.aggregate([
          { $match: { studentId: { $in: ids }, status: 'Present' } },
          { $group: { _id: '$studentId', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(counts.map(x => [x._id, x.count]));
        const updates = [];
        for (const s of students) {
          const paymentChanged = normalizePayment(s);
          const nextStatus = statusFor(countMap.get(s.id) || 0, s.requiredDays, s.balanceAmount);
          if (s.status !== nextStatus || paymentChanged) {
            s.status = nextStatus;
            updates.push({ updateOne: { filter: { id: s.id }, update: { $set: { status: nextStatus, totalAmount: s.totalAmount, advancePaid: s.advancePaid, balanceAmount: s.balanceAmount } } } });
          }
        }
        // Persist only the statuses that were stale.
        // A failed status update (e.g. a slot clash) must never stop the list from loading.
        if (updates.length) {
          try { await Student.bulkWrite(updates, { ordered: false }); }
          catch (e) { console.warn('Some student statuses could not be saved:', e.message); }
        }
      }
    } else {
      students = await withDb(async () => {
        const db = await readDb();
        const list = db.students.filter(s => !branchId || s.branchId === branchId);
        let changed = false;
        for (const s of list) {
          const paymentChanged = normalizePayment(s);
          const attended = db.attendance.filter(a => a.studentId === s.id && a.status === 'Present').length;
          const nextStatus = statusFor(attended, s.requiredDays, s.balanceAmount);
          if (s.status !== nextStatus || paymentChanged) { s.status = nextStatus; changed = true; }
        }
        if (changed) await writeDb(db);
        return list;
      });
    }

    const q = String(search).trim().toLowerCase();
    if (q) students = students.filter(s => `${s.name} ${s.phone} ${s.id}`.toLowerCase().includes(q));
    res.json(students);
  } catch (e) { console.error(e); publicError(res, 500, 'Unable to load students.'); }
});

app.post('/api/students', async (req, res) => {
  try {
    const { branchId, name, phone, address = '', vehicleId, startDate, slotId, instructorName = '', advancePaid = 0, notes = '' } = req.body || {};
    const cleanName = String(name || '').trim().slice(0, 100);
    const cleanPhone = String(phone || '').trim();
    const vehicle = VEHICLES.find(v => v.id === vehicleId);
    const slot = SLOTS.find(s => s.id === slotId);
    if (!validBranch(branchId)) return publicError(res, 400, 'Please select a valid branch.');
    if (cleanName.length < 2) return publicError(res, 400, 'Please enter the student name.');
    if (!/^\d{10}$/.test(cleanPhone)) return publicError(res, 400, 'Please enter a valid 10-digit phone number.');
    if (!vehicle) return publicError(res, 400, 'Please select a training vehicle.');
    if (!slot) return publicError(res, 400, 'Please select a training slot.');
    if (!validDate(startDate)) return publicError(res, 400, 'Please select a valid training start date.');
    const cleanInstructorName = String(instructorName || '').trim().slice(0, 100);
    if (cleanInstructorName.length < 2) return publicError(res, 400, 'Please enter the instructor name.');
    const totalAmount = Number(vehicle.totalAmount);
    const advance = Number(advancePaid);
    if (!Number.isFinite(advance) || advance < 0 || advance > totalAmount) return publicError(res, 400, `Advance amount must be between 0 and ₹${totalAmount}.`);
    const balanceAmount = totalAmount - advance;
    const student = {
      id: '', branchId, name: cleanName, phone: cleanPhone, address: String(address || '').trim().slice(0, 500),
      vehicleId: vehicle.id, vehicleName: vehicle.name, requiredDays: vehicle.trainingDays,
      totalAmount, advancePaid: advance, balanceAmount, instructorName: cleanInstructorName,
      slotId: slot.id, slotLabel: slot.label,
      startDate, notes: String(notes || '').trim().slice(0, 1000), status: 'Active', createdAt: new Date().toISOString()
    };
    const slotTaken = (holder) => `Slot ${slot.label} is already assigned to ${holder.name} for ${vehicle.name}. Please choose another slot.`;
    if (useMongo) {
      const holder = await Student.findOne({  vehicleId: vehicle.id, slotId: slot.id, status: 'Active' }).lean();
      if (holder) return publicError(res, 409, slotTaken(holder));
      // The unique indexes also block two staff booking the same slot, or
      // getting the same student ID, at the same moment.
      for (let attempt = 1; ; attempt++) {
        const prefix = BRANCHES.find(b => b.id === branchId).idPrefix;
        const ids = (await Student.find({ id: { $regex: `^${prefix}-` } }).select('id').lean()).map(s => s.id);
        const counter = await Counter.findById(branchId).lean();
        student.id = nextStudentId(branchId, ids, counter?.value);
        try {
          await Student.create(student);
          await Counter.updateOne({ _id: branchId }, { $max: { value: studentNumber(branchId, student.id) } }, { upsert: true });
          break;
        }
        catch (e) {
          if (e.code !== 11000) throw e;
          if (e.keyPattern?.id && attempt < 5) continue;
          if (e.keyPattern?.id) throw e;
          return publicError(res, 409, `Slot ${slot.label} was just booked for ${vehicle.name}. Please choose another slot.`);
        }
      }
    } else {
      const holder = await withDb(async () => {
        const db = await readDb();
        const existing = db.students.find(s =>  s.vehicleId === vehicle.id && s.slotId === slot.id && s.status === 'Active');
        if (existing) return existing;
        db.lastStudentNumber ||= {};
        student.id = nextStudentId(branchId, db.students.map(s => s.id), db.lastStudentNumber[branchId]);
        db.lastStudentNumber[branchId] = studentNumber(branchId, student.id);
        db.students.unshift(student);
        await writeDb(db);
        return null;
      });
      if (holder) return publicError(res, 409, slotTaken(holder));
    }
    res.status(201).json(student);
  } catch (e) { console.error(e); publicError(res, 500, 'Student registration failed.'); }
});

// Records a payment against the student's outstanding balance. The balance is
// always derived from totalAmount - advancePaid so it can never become negative.
// A student moves to History only when BOTH training days are complete AND the
// payment balance is fully paid.
app.put('/api/students/:studentId/payment', async (req, res) => {
  try {
    const studentId = String(req.params.studentId || '');
    const { branchId, amount } = req.body || {};
    const payment = Number(amount);
    if (!studentId || !validBranch(branchId) || !Number.isFinite(payment) || payment <= 0) {
      return publicError(res, 400, 'A valid student, branch and payment amount are required.');
    }

    if (useMongo) {
      const student = await Student.findOne({ id: studentId, branchId });
      if (!student) return publicError(res, 404, 'Student not found in this branch.');
      const currentBalance = Math.max(0, Number(student.totalAmount || 0) - Number(student.advancePaid || 0));
      if (currentBalance <= 0) return publicError(res, 400, 'There is no payment due for this student.');
      if (payment > currentBalance) return publicError(res, 400, `Payment cannot be more than the remaining ₹${currentBalance}.`);
      student.advancePaid = Math.min(Number(student.totalAmount || 0), Number(student.advancePaid || 0) + payment);
      student.balanceAmount = Math.max(0, Number(student.totalAmount || 0) - Number(student.advancePaid || 0));
      const attended = await Attendance.countDocuments({ studentId: student.id, status: 'Present' });
      student.status = statusFor(attended, student.requiredDays, student.balanceAmount);
      await student.save();
      return res.json({ ok: true, student });
    }

    const result = await withDb(async () => {
      const db = await readDb();
      const student = db.students.find(s => s.id === studentId && s.branchId === branchId);
      if (!student) return { error: [404, 'Student not found in this branch.'] };
      const total = Number(student.totalAmount || 0);
      const paid = Number(student.advancePaid || 0);
      const currentBalance = Math.max(0, total - paid);
      if (currentBalance <= 0) return { error: [400, 'There is no payment due for this student.'] };
      if (payment > currentBalance) return { error: [400, `Payment cannot be more than the remaining ₹${currentBalance}.`] };
      student.advancePaid = Math.min(total, paid + payment);
      student.balanceAmount = Math.max(0, total - student.advancePaid);
      const attended = db.attendance.filter(a => a.studentId === student.id && a.status === 'Present').length;
      student.status = statusFor(attended, student.requiredDays, student.balanceAmount);
      await writeDb(db);
      return { student };
    });
    if (result.error) return publicError(res, ...result.error);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    publicError(res, 500, 'Payment update failed.');
  }
});

// Permanently deletes a student and all of their attendance records.
// Their slot becomes free immediately because the student no longer exists.
app.delete('/api/students/:studentId', async (req, res) => {
  try {
    const studentId = String(req.params.studentId || '');
    const { branchId } = req.query;
    if (!studentId || !validBranch(branchId)) return publicError(res, 400, 'A valid student and branch are required.');

    if (useMongo) {
      const student = await Student.findOne({ id: studentId, branchId }).lean();
      if (!student) return publicError(res, 404, 'Student not found in this branch. It may already be deleted.');
      // Remember this ID number first so it is never given to a new student.
      const number = studentNumber(branchId, student.id);
      if (number) await Counter.updateOne({ _id: branchId }, { $max: { value: number } }, { upsert: true });
      await Attendance.deleteMany({ studentId: student.id });
      await Student.deleteOne({ id: student.id, branchId });
    } else {
      const found = await withDb(async () => {
        const db = await readDb();
        const index = db.students.findIndex(s => s.id === studentId && s.branchId === branchId);
        if (index === -1) return false;
        const number = studentNumber(branchId, studentId);
        db.lastStudentNumber ||= {};
        db.lastStudentNumber[branchId] = Math.max(db.lastStudentNumber[branchId] || 0, number);
        db.students.splice(index, 1);
        db.attendance = db.attendance.filter(a => a.studentId !== studentId);
        await writeDb(db);
        return true;
      });
      if (!found) return publicError(res, 404, 'Student not found in this branch. It may already be deleted.');
    }

    res.json({ ok: true, message: 'Student deleted successfully.' });
  } catch (e) { console.error(e); publicError(res, 500, 'Student deletion failed.'); }
});

app.get('/api/attendance', async (req, res) => {
  try {
    const { branchId, date, studentId } = req.query;
    if (branchId && !validBranch(branchId)) return publicError(res, 400, 'Invalid branchId.');
    const filter = {};
    if (branchId) filter.branchId = String(branchId);
    if (date) filter.date = String(date);
    if (studentId) filter.studentId = String(studentId);
    const records = useMongo
      ? await Attendance.find(filter).sort({ date: -1 }).lean()
      : (await withDb(readDb)).attendance.filter(a => (!branchId || a.branchId === branchId) && (!date || a.date === date) && (!studentId || a.studentId === studentId));
    res.json(records);
  } catch (e) { console.error(e); publicError(res, 500, 'Unable to load attendance.'); }
});

// Changing a Present day of a completed student would reopen their training.
// That is only allowed while their old slot is still free.
const slotReopenBlocked = (holder, student) => `Cannot reopen ${student.name}'s training: slot ${student.slotLabel} for ${student.vehicleName} is now assigned to ${holder.name} (${holder.id}).`;
const alreadyComplete = (student) => `Training is already complete at ${student.requiredDays}/${student.requiredDays}. This student is now in Student History.`;

app.put('/api/attendance', async (req, res) => {
  try {
    const { studentId, branchId, date, status } = req.body || {};
    if (!studentId || !validBranch(branchId) || !validDate(date) || !validStatus(status)) return publicError(res, 400, 'studentId, branchId, valid date and valid status are required.');
    // A student's training is completed exactly when the required number of
    // UNIQUE training dates are marked Present. Never allow progress such as
    // 21/20: once the required days are reached, the student moves to History.
    if (useMongo) {
      const student = await Student.findOne({ id: String(studentId), branchId });
      if (!student) return publicError(res, 404, 'Student not found in this branch.');
      // Both lookups run at the same time to keep each click fast.
      const [existing, attendedBefore] = await Promise.all([
        Attendance.findOne({ studentId: student.id, date }).lean(),
        Attendance.countDocuments({ studentId: student.id, status: 'Present' })
      ]);
      const currentPresent = existing?.status === 'Present';
      if (status === 'Present' && !currentPresent && attendedBefore >= student.requiredDays) return publicError(res, 400, alreadyComplete(student));
      if (student.status === 'Completed' && currentPresent && status !== 'Present' && student.slotId) {
        const holder = await Student.findOne({ branchId, vehicleId: student.vehicleId, slotId: student.slotId, status: 'Active', id: { $ne: student.id } }).lean();
        if (holder) return publicError(res, 409, slotReopenBlocked(holder, student));
      }
      const record = { id: existing?.id || uid(), studentId: student.id, branchId, date, status, updatedAt: new Date().toISOString() };
      await Attendance.findOneAndUpdate({ studentId: student.id, date }, record, { upsert: true, setDefaultsOnInsert: true });
      // The new Present count follows from this change; no need to count again.
      const attended = attendedBefore - (currentPresent ? 1 : 0) + (status === 'Present' ? 1 : 0);
      const nextStatus = statusFor(attended, student.requiredDays, student.balanceAmount);
      if (student.status !== nextStatus) {
        student.status = nextStatus;
        await student.save();
      }
      return res.json({ ok: true, record, student });
    }

    const result = await withDb(async () => {
      const db = await readDb();
      const student = db.students.find(s => s.id === studentId && s.branchId === branchId);
      if (!student) return { error: [404, 'Student not found in this branch.'] };
      const idx = db.attendance.findIndex(a => a.studentId === studentId && a.date === date);
      const existing = idx >= 0 ? db.attendance[idx] : null;
      const currentPresent = existing?.status === 'Present';
      const attendedBefore = db.attendance.filter(a => a.studentId === studentId && a.status === 'Present').length;
      if (status === 'Present' && !currentPresent && attendedBefore >= student.requiredDays) return { error: [400, alreadyComplete(student)] };
      if (student.status === 'Completed' && currentPresent && status !== 'Present' && student.slotId) {
        const holder = db.students.find(s => s.id !== student.id && s.branchId === branchId && s.vehicleId === student.vehicleId && s.slotId === student.slotId && s.status === 'Active');
        if (holder) return { error: [409, slotReopenBlocked(holder, student)] };
      }
      const record = { id: existing?.id || uid(), studentId, branchId, date, status, updatedAt: new Date().toISOString() };
      if (idx >= 0) db.attendance[idx] = record; else db.attendance.push(record);
      const attended = db.attendance.filter(a => a.studentId === studentId && a.status === 'Present').length;
      student.status = statusFor(attended, student.requiredDays, student.balanceAmount);
      await writeDb(db);
      return { record, student };
    });
    if (result.error) return publicError(res, ...result.error);
    res.json({ ok: true, ...result });
  } catch (e) { console.error(e); publicError(res, 500, 'Attendance save failed.'); }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const { branchId } = req.query;
    if (!validBranch(branchId)) return publicError(res, 400, 'Invalid branchId.');
    const db = useMongo ? null : await withDb(readDb);
    const students = useMongo ? await Student.find({ branchId }).lean() : db.students.filter(s => s.branchId === branchId);
    const attendance = useMongo ? await Attendance.find({ branchId, date: today(), status: 'Present' }).lean() : db.attendance.filter(a => a.branchId === branchId && a.date === today() && a.status === 'Present');
    res.json({ active: students.filter(s => s.status === 'Active').length, completed: students.filter(s => s.status === 'Completed').length, presentToday: new Set(attendance.map(a => a.studentId)).size, vehicles: VEHICLES.length });
  } catch (e) { console.error(e); publicError(res, 500, 'Unable to load dashboard.'); }
});

app.use('/api', (_req, res) => publicError(res, 404, 'API route not found.'));

// Serve the built React website (frontend/dist) from this same server,
// so the whole app can be hosted as ONE service.
if (existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(FRONTEND_DIST, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.json({ ok: true, service: 'Vasu Driving School API', health: '/api/health' }));
}

app.use((_req, res) => publicError(res, 404, 'Not found.'));
// Invalid JSON bodies and any other unexpected error return a clean JSON message.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return publicError(res, 400, 'Invalid request data.');
  console.error(err);
  publicError(res, err.status || 500, 'Something went wrong.');
});

if (IS_PRODUCTION && !authRequired) {
  console.error('APP_PASSWORD is not set. Refusing to start in production without a login password.');
  process.exit(1);
}
if (!authRequired) console.warn('WARNING: APP_PASSWORD is not set, so the website has no login. Set it before hosting.');
if (IS_PRODUCTION && !useMongo) {
  console.warn('WARNING: Running in production with the JSON file database. Most hosting platforms erase local files on every restart/redeploy. Set MONGODB_URI to keep data safe.');
}

// Keep student status consistent with attendance whenever the JSON database is used.
// This also repairs older test data that may contain 20/20 students still marked Active.
if (!useMongo) {
  try {
    await withDb(async () => {
      const db = await readDb();
      let changed = false;
      for (const student of db.students) {
        const paymentChanged = normalizePayment(student);
        const present = db.attendance.filter(a => a.studentId === student.id && a.status === 'Present').length;
        const nextStatus = statusFor(present, student.requiredDays, student.balanceAmount);
        if (student.status !== nextStatus || paymentChanged) { student.status = nextStatus; changed = true; }
      }
      if (changed) await writeDb(db);
    });
  } catch (e) { console.error('Startup status sync failed:', e.message); }
}

async function mongoConnect() {
  if (!useMongo) return;
  try { await mongoose.connect(process.env.MONGODB_URI); console.log('MongoDB connected'); }
  catch (e) { console.error('MongoDB connection failed:', e.message); process.exit(1); }
  // Older databases may already contain duplicate attendance rows; keep running and report it.
  try { await Attendance.syncIndexes(); }
  catch (e) { console.warn('Could not create the unique attendance index (duplicate records may exist):', e.message); }
  try { await Student.syncIndexes(); }
  catch (e) { console.warn('Could not create the unique slot index (two active students may share a slot):', e.message); }
}
await mongoConnect();
app.listen(PORT, () => console.log(`Vasu backend running at http://localhost:${PORT} (${useMongo ? 'MongoDB' : 'JSON file'} mode)`));
