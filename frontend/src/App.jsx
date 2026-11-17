import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Car,
  CarFront,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  History,
  LayoutDashboard,
  Lock,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Users,
  Trash2,
  X,
} from 'lucide-react';

import { api, setToken } from './api';
import ownerPhoto from './assets/owner.jpg';
import {
  ATTENDANCE_STATUS,
  BRANCHES,
  SLOTS,
  VEHICLES,
  today,
} from './config';

function pageTitle(page) {
  const titles = {
    dashboard: 'Dashboard',
    students: 'Students',
    new: 'New Student',
    profile: 'Student Profile',
    attendance: "Today's Attendance",
    history: 'Student History',
    slots: 'Training Slots',
    vehicles: 'Training Vehicles',
  };

  return titles[page] || 'Dashboard';
}

export default function App() {
  // Keep the branch unselected when the website opens.
  // The user must choose Tagarapuvalasa or Ananthapuram first.
  const [branch, setBranch] = useState('');
  const [students, setStudents] = useState([]);
  // All branches' students are loaded only for shared vehicle-slot availability.
  const [slotStudents, setSlotStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [page, setPage] = useState('dashboard');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [query, setQuery] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 'checking' -> asking the server, 'login' -> password needed, 'ready' -> app usable.
  const [auth, setAuth] = useState('checking');
  const [authError, setAuthError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  // Which branch the loaded students belong to (used to detect deleted students).
  const [loadedFor, setLoadedFor] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Ignores responses from older requests, e.g. after quickly switching branches.
  const requestId = useRef(0);
  // Attendance clicks still being saved. While any are pending, a reload could
  // bring back the old colour, so reload results are skipped and repeated later.
  const pendingSaves = useRef(0);
  const saveCount = useRef(0);
  const reloadAfterSaves = useRef(false);

  const currentBranch = BRANCHES.find((item) => item.id === branch);

  // Load students and attendance whenever the selected branch changes.
  // silent: background refresh without the loading text or touching error messages.
  async function loadData({ silent = false } = {}) {
    if (!branch) return;

    const id = ++requestId.current;
    const savesAtStart = saveCount.current;
    const savesWerePending = pendingSaves.current > 0;
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const [studentData, attendanceData, allStudentData] = await Promise.all([
        api(`/students?branchId=${encodeURIComponent(branch)}`),
        api(`/attendance?branchId=${encodeURIComponent(branch)}`),
        api('/students'),
      ]);

      if (id !== requestId.current) return;

      // An attendance click happened during this reload: the data may not
      // include it yet. Keep what is on screen and reload once saving is done.
      if (savesWerePending || saveCount.current !== savesAtStart) {
        reloadAfterSaves.current = true;
        return;
      }

      setStudents(studentData);
      setSlotStudents(allStudentData);
      setLoadedFor(branch);
      setAttendance(attendanceData);
    } catch (err) {
      if (id === requestId.current && !silent) setError(err.message);
    } finally {
      if (id === requestId.current && !silent) setLoading(false);
    }
  }

  // Ask the server whether a login is needed.
  async function checkSession() {
    setAuth('checking');
    setAuthError('');

    try {
      const session = await api('/session');
      setAuthRequired(session.authRequired);
      setAuth(session.authRequired && !session.authenticated ? 'login' : 'ready');
    } catch (err) {
      setAuthError(err.message);
      setAuth('login');
    }
  }

  useEffect(() => {
    checkSession();

    // api.js fires this event when the server says the login has expired.
    function onLogout() {
      setAuth('login');
    }

    window.addEventListener('vasu:logout', onLogout);
    return () => window.removeEventListener('vasu:logout', onLogout);
  }, []);

  function onLoggedIn() {
    setAuth('ready');
    setAuthError('');
  }

  function logout() {
    setToken('');
    goTo({ branch: '', page: 'dashboard' });
    setAuth('login');
  }

  useEffect(() => {
    // Clear the previous branch's data so it never shows under another branch.
    requestId.current += 1;
    setLoadedFor('');
    setLoading(false);
    setStudents([]);
    setSlotStudents([]);
    setAttendance([]);
  }, [branch]);

  // Reload whenever a screen is opened, so slots and attendance always show
  // the latest bookings, including ones made by staff on other devices.
  useEffect(() => {
    if (branch && auth === 'ready') loadData();
  }, [branch, page, auth]);

  // Keep the open screen up to date: refresh every 30 seconds and whenever
  // the staff member comes back to this browser tab.
  const latestLoad = useRef(loadData);
  latestLoad.current = loadData;

  useEffect(() => {
    if (!branch || auth !== 'ready') return;

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        latestLoad.current({ silent: true });
      }
    };

    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [branch, auth]);

  // Centralized navigation history.
  // Every screen (branch, page and opened student) is stored as a browser
  // history entry, so the in-app Back button and the browser / phone back
  // gesture both return to the exact previous state.
  function applyState(state) {
    setBranch(state?.branch || '');
    setPage(state?.page || 'dashboard');
    setSelectedStudent(state?.student || null);
    setMobileMenu(false);
    setError('');
    setQuery('');
  }

  function goTo(nextState, { replace = false } = {}) {
    const current = window.history.state;
    const index = replace ? current?.index ?? 0 : (current?.index ?? 0) + 1;
    const entry = { ...nextState, index };

    if (replace) {
      window.history.replaceState(entry, '');
    } else {
      window.history.pushState(entry, '');
    }

    applyState(entry);
  }

  useEffect(() => {
    // The app always opens on the branch selection screen.
    window.history.replaceState({ branch: '', page: 'dashboard', index: 0 }, '');

    function onPopState(event) {
      applyState(event.state);
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function goBack() {
    if ((window.history.state?.index ?? 0) > 0) {
      window.history.back();
    } else {
      goTo({ branch: '', page: 'dashboard' }, { replace: true });
    }
  }

  const activeStudents = students.filter(
    (student) => student.status === 'Active'
  );
  // Slot availability is shared between Tagarapuvalasa and Ananthapuram.
  const slotActiveStudents = slotStudents.filter(
    (student) => student.status === 'Active'
  );

  const completedStudents = students.filter(
    (student) => student.status === 'Completed'
  );

  const presentToday = new Set(
    attendance
      .filter(
        (record) =>
          record.date === today() && record.status === 'Present'
      )
      .map((record) => record.studentId)
  ).size;

  function navigate(nextPage, options) {
    setMobileMenu(false);

    // Clicking the screen that is already open should not add a history step.
    if (nextPage === page && !selectedStudent) return;

    goTo({ branch, page: nextPage }, options);
  }

  function openStudent(student) {
    // A booking shown on the shared slots page may belong to the other branch.
    // Open the student's own branch so their profile and attendance load correctly.
    goTo({ branch: student.branchId || branch, page: 'profile', student });
  }

  function selectBranch(branchId) {
    goTo({ branch: branchId, page: 'dashboard' });
  }

  function changeBranch() {
    goTo({ branch: '', page: 'dashboard' });
  }

  // Replace (or remove) the attendance record of one student on one date.
  function putRecord(list, studentId, date, record) {
    const others = list.filter(
      (item) => !(item.studentId === studentId && item.date === date)
    );
    return record ? [...others, record] : others;
  }

  async function saveAttendance(student, date, status) {
    setError('');

    const previous = attendance.find(
      (item) => item.studentId === student.id && item.date === date
    );
    if (previous?.status === status) return;

    // Show the new colour immediately; the server saves it in the background.
    const optimisticId = `pending-${Date.now()}-${Math.random()}`;
    const optimistic = {
      ...previous,
      id: optimisticId,
      studentId: student.id,
      branchId: student.branchId,
      date,
      status,
    };
    setAttendance((list) => putRecord(list, student.id, date, optimistic));

    pendingSaves.current += 1;
    saveCount.current += 1;

    // Only touch the record if no newer click has replaced it meanwhile.
    const stillOurs = (list) =>
      list.some((item) => item.id === optimisticId);

    try {
      const result = await api('/attendance', {
        method: 'PUT',
        body: JSON.stringify({
          studentId: student.id,
          branchId: student.branchId,
          date,
          status,
        }),
      });

      setAttendance((list) =>
        stillOurs(list)
          ? putRecord(list, student.id, date, result.record)
          : list
      );

      if (result.student?.status) {
        const withStatus = (list) =>
          list.map((item) =>
            item.id === student.id
              ? { ...item, status: result.student.status }
              : item
          );
        setStudents(withStatus);
        // Slot bookings use every student, so keep their status in step too.
        setSlotStudents(withStatus);
      }

      // A student enters History only when both conditions are true:
      // all required training days are completed AND payment due is ₹0.
      if (result.student?.status === 'Completed') {
        goTo({ branch, page: 'history' }, { replace: true });
      }
    } catch (err) {
      // Saving failed: put the old colour back and explain why.
      setAttendance((list) =>
        stillOurs(list)
          ? putRecord(list, student.id, date, previous || null)
          : list
      );
      setError(err.message);
    } finally {
      pendingSaves.current -= 1;

      if (pendingSaves.current === 0 && reloadAfterSaves.current) {
        reloadAfterSaves.current = false;
        latestLoad.current({ silent: true });
      }
    }
  }

  async function savePayment(student, amount) {
    setError('');

    try {
      const result = await api(`/students/${encodeURIComponent(student.id)}/payment`, {
        method: 'PUT',
        body: JSON.stringify({
          studentId: student.id,
          branchId: student.branchId,
          amount,
        }),
      });

      await loadData();

      // History is reached only when training AND payment are both complete.
      if (result.student?.status === 'Completed') {
        goTo({ branch, page: 'history' }, { replace: true });
      }

      return result.student;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function deleteStudent(student) {
    setDeleting(true);
    setError('');

    try {
      await api(
        `/students/${encodeURIComponent(student.id)}?branchId=${encodeURIComponent(branch)}`,
        { method: 'DELETE' }
      );

      setDeleteTarget(null);

      // Leave the deleted student's profile and show the list it was in.
      // Replacing the history entry means Back never returns to the deleted profile.
      if (page === 'profile') {
        goTo(
          {
            branch,
            page: student.status === 'Completed' ? 'history' : 'students',
          },
          { replace: true }
        );
      } else {
        await loadData();
      }
    } catch (err) {
      setDeleteTarget(null);
      setError(err.message);
      loadData({ silent: true });
    } finally {
      setDeleting(false);
    }
  }

  async function registerStudent(form) {
    const result = await api('/students', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        branchId: branch,
      }),
    });

    await loadData();
    return result;
  }

  if (auth === 'checking') {
    return (
      <div className="branch-screen">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (auth === 'login') {
    return (
      <Login
        serverError={authError}
        onRetry={checkSession}
        onLoggedIn={onLoggedIn}
      />
    );
  }

  // The first screen asks the user to choose a branch.
  if (!branch) {
    return <BranchSelect onSelect={selectBranch} />;
  }

  return (
    <div className="app">
      <Sidebar
        page={page}
        branchName={currentBranch?.name}
        mobileMenu={mobileMenu}
        onNavigate={navigate}
        onChangeBranch={changeBranch}
        onLogout={authRequired ? logout : null}
        onClose={() => setMobileMenu(false)}
      />

      <main>
        <Header
          page={page}
          branchName={currentBranch?.name}
          onMenu={() => setMobileMenu(true)}
          onRefresh={loadData}
          onNewStudent={() => navigate('new')}
          onBack={goBack}
        />

        {error && <div className="error-banner">{error}</div>}

        <section className="content">
          {loading && !students.length && (
            <div className="loading">Loading...</div>
          )}

          {page === 'dashboard' && (
            <Dashboard
              active={activeStudents}
              completed={completedStudents}
              presentToday={presentToday}
              setPage={navigate}
            />
          )}

          {page === 'students' && (
            <Students
              students={activeStudents}
              attendance={attendance}
              query={query}
              setQuery={setQuery}
              onOpen={openStudent}
              onDelete={setDeleteTarget}
              onNew={() => navigate('new')}
            />
          )}

          {page === 'new' && (
            <NewStudent
              branchName={currentBranch?.name}
              activeStudents={slotActiveStudents}
              onBack={goBack}
              onDone={() => navigate('students', { replace: true })}
              onRegister={registerStudent}
            />
          )}

          {page === 'profile' &&
            selectedStudent &&
            (() => {
              const current = students.find(
                (item) => item.id === selectedStudent.id
              );

              // Reached through Back after the student was deleted.
              if (!current && loadedFor === branch) {
                return (
                  <div className="panel">
                    <Empty text="This student no longer exists. They may have been deleted." />
                  </div>
                );
              }

              return (
                <Profile
                  student={current || selectedStudent}
                  attendance={attendance}
                  onAttendance={saveAttendance}
                  onPayment={savePayment}
                  onDelete={() => setDeleteTarget(current || selectedStudent)}
                />
              );
            })()}

          {page === 'attendance' && (
            <Attendance
              students={activeStudents}
              attendance={attendance}
              onSave={saveAttendance}
            />
          )}

          {page === 'history' && (
            <HistoryPage
              students={completedStudents}
              onOpen={openStudent}
            />
          )}

          {page === 'slots' && (
            <SlotsPage students={slotActiveStudents} onOpen={openStudent} />
          )}

          {page === 'vehicles' && <Vehicles />}
        </section>
      </main>

      {deleteTarget && (
        <ConfirmDeleteModal
          student={deleteTarget}
          deleting={deleting}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={() => deleteStudent(deleteTarget)}
        />
      )}
    </div>
  );
}

function Login({ serverError, onRetry, onLoggedIn }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setBusy(true);

    try {
      const result = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      setToken(result.token);
      onLoggedIn();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="branch-screen">
      <div className="hero">
        <div className="logo big">V</div>
        <h1>VASU DRIVING SCHOOL</h1>
        <p>Training Management System</p>
      </div>

      {serverError ? (
        <div className="login-card">
          <div className="error-banner form-error">{serverError}</div>
          <button className="primary" type="button" onClick={onRetry}>
            <RefreshCw size={17} />
            Try again
          </button>
        </div>
      ) : (
        <form className="login-card" onSubmit={submit}>
          <label>
            <span>Staff password</span>
            <input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>

          {message && <div className="error-banner form-error">{message}</div>}

          <button className="primary" type="submit" disabled={busy}>
            <Lock size={17} />
            {busy ? 'Checking...' : 'Log in'}
          </button>
        </form>
      )}
    </div>
  );
}

function BranchSelect({ onSelect }) {
  return (
    <div className="bs-page">
      <div className="bs-hero">
        <div className="bs-glow bs-glow-one" />
        <div className="bs-glow bs-glow-two" />

        <div className="bs-hero-inner">
          <div className="bs-photo-ring">
            <img
              className="bs-photo"
              src={ownerPhoto}
              alt="Vasu Driving School owner"
            />
          </div>

          <span className="bs-chip">Staff Portal</span>
          <h1 className="bs-title">
            VASU <span>DRIVING SCHOOL</span>
          </h1>
          <p className="bs-subtitle">Training Management System</p>
        </div>

        {/* Decorative road with moving lane markings and a small car. */}
        <div className="bs-road" aria-hidden="true">
          <div className="bs-lane" />
          <Car className="bs-car" size={26} />
        </div>
      </div>

      <div className="bs-sheet">
        <div className="bs-sheet-head">
          <h2>Choose your branch</h2>
          <p>Select the branch before managing students.</p>
        </div>

        <div className="bs-grid">
          {BRANCHES.map((branch, index) => (
            <button
              type="button"
              className="bs-card"
              key={branch.id}
              style={{ animationDelay: `${0.15 + index * 0.12}s` }}
              onClick={() => onSelect(branch.id)}
            >
              <span className="bs-card-badge">
                <MapPin size={22} />
              </span>

              <span className="bs-card-text">
                <span className="bs-card-code">
                  {branch.name.slice(0, 3).toUpperCase()} BRANCH
                </span>
                <b>{branch.name}</b>
                <span className="bs-card-open">
                  Open branch <ArrowRight size={15} />
                </span>
              </span>

              <ChevronRight className="bs-card-chevron" size={20} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  page,
  branchName,
  mobileMenu,
  onNavigate,
  onChangeBranch,
  onLogout,
  onClose,
}) {
  const navigationItems = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['students', 'Students', Users],
    ['attendance', 'Attendance', CalendarCheck],
    ['history', 'Student History', History],
    ['slots', 'Training Slots', Clock],
    ['vehicles', 'Training Vehicles', CarFront],
  ];

  return (
    <aside className={mobileMenu ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <div className="logo">V</div>
        <div>
          <b>Vasu</b>
          <span>Driving School</span>
        </div>

        <button className="close" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="branch-pill">📍 {branchName}</div>

      <nav>
        {navigationItems.map(([id, label, Icon]) => (
          <button
            key={id}
            className={page === id ? 'active' : ''}
            onClick={() => onNavigate(id)}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </nav>

      <button className="switch" onClick={onChangeBranch}>
        <LogOut size={17} />
        Change branch
      </button>

      {onLogout && (
        <button className="switch" onClick={onLogout}>
          <Lock size={17} />
          Log out
        </button>
      )}
    </aside>
  );
}

function Header({
  page,
  branchName,
  onMenu,
  onRefresh,
  onNewStudent,
  onBack,
}) {
  return (
    <header>
      <div className="header-left">
        <button className="hamb" onClick={onMenu}>
          <Menu />
        </button>

        <button className="icon-btn" onClick={onBack} title="Back">
          <ArrowLeft size={17} />
        </button>

        <div>
          <h1>{pageTitle(page)}</h1>
          <p>{branchName} Branch</p>
        </div>
      </div>

      <div className="header-actions">
        <button className="icon-btn" onClick={onRefresh} title="Refresh">
          <RefreshCw size={17} />
        </button>

        <button className="primary" onClick={onNewStudent}>
          <Plus size={18} />
          New Student
        </button>
      </div>
    </header>
  );
}

function Dashboard({ active, completed, presentToday, setPage }) {
  return (
    <>
      <div className="welcome">
        <div>
          <span className="eyebrow">GOOD DAY</span>
          <h2>Training overview</h2>
          <p>Manage students and attendance from one place.</p>
        </div>

        <button className="outline" onClick={() => setPage('attendance')}>
          <CalendarCheck size={17} />
          Mark attendance
        </button>
      </div>

      <div className="stats">
        <Stat icon={<Users />} label="Active Students" value={active.length} />
        <Stat
          icon={<CheckCircle2 />}
          label="Completed"
          value={completed.length}
        />
        <Stat
          icon={<CalendarCheck />}
          label="Present Today"
          value={presentToday}
        />
        <Stat
          icon={<CarFront />}
          label="Training Vehicles"
          value={VEHICLES.length}
        />
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <h3>Quick actions</h3>
          </div>

          <div className="quick">
            <button onClick={() => setPage('new')}>
              <Plus />
              <b>Register New Student</b>
              <span>Add a new learner and training plan</span>
            </button>

            <button onClick={() => setPage('students')}>
              <Search />
              <b>Find Existing Student</b>
              <span>Search by name, phone or ID</span>
            </button>

            <button onClick={() => setPage('history')}>
              <History />
              <b>View Completed History</b>
              <span>See full training records</span>
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Training vehicles</h3>
            <button className="link" onClick={() => setPage('vehicles')}>
              View details
            </button>
          </div>

          {VEHICLES.map((vehicle) => (
            <div className="mini" key={vehicle.id}>
              <div className="vehicle-mini-icon">
                <CarFront size={17} />
              </div>
              <div>
                <b>{vehicle.name}</b>
                <span>{vehicle.trainingDays} training days</span>
              </div>
              <span className="configured">Training option</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Students({
  students,
  attendance,
  query,
  setQuery,
  onOpen,
  onDelete,
  onNew,
}) {
  const searchText = query.toLowerCase();

  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.phone} ${student.id}`
      .toLowerCase()
      .includes(searchText)
  );

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone or student ID..."
          />
        </div>

        <button className="primary" onClick={onNew}>
          <Plus size={17} />
          New Student
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Vehicle</th>
              <th>Training</th>
              <th>Payment</th>
              <th>Instructor</th>
              <th>Progress</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {filteredStudents.map((student) => (
              <tr key={student.id} onClick={() => onOpen(student)}>
                <td>
                  <div className="person">
                    <div className="avatar">{student.name[0]}</div>
                    <div>
                      <b>{student.name}</b>
                      <span>
                        {student.id} · {student.phone}
                        <small className="slot-inline">
                          ⏰ {student.slotLabel || 'No slot'}
                        </small>
                      </span>
                    </div>
                  </div>
                </td>
                <td>{student.vehicleName}</td>
                <td>{student.requiredDays} days</td>
                <td>
                  ₹{student.balanceAmount ?? Math.max(0, (student.totalAmount ?? 0) - (student.advancePaid ?? 0))} balance
                </td>
                <td>{student.instructorName || '—'}</td>
                <td>
                  <Progress student={student} attendance={attendance} />
                </td>
                <td>
                  <StatusBadge status={student.status} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-danger"
                      title="Delete student"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(student);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={18} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!filteredStudents.length && <Empty text="No students found." />}
      </div>
    </div>
  );
}

function NewStudent({
  branchName,
  activeStudents,
  onBack,
  onDone,
  onRegister,
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    vehicleId: '',
    startDate: today(),
    notes: '',
    slotId: '',
    instructorName: '',
    advancePaid: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Slots of the chosen vehicle, marked as booked by its active students.
  // The backend still performs the final check when registering.
  const slots = slotsFor(form.vehicleId, activeStudents);

  const selectedVehicle = VEHICLES.find(
    (vehicle) => vehicle.id === form.vehicleId
  );
  const selectedSlot = slots.find((slot) => slot.id === form.slotId);

  // Clear the chosen slot when the vehicle changes or the slot gets booked.
  useEffect(() => {
    if (form.slotId && !selectedSlot?.available) {
      updateField('slotId', '');
    }
  }, [form.vehicleId, activeStudents]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');

    if (!/^\d{10}$/.test(form.phone)) {
      setMessage('Enter a valid 10-digit phone number.');
      return;
    }

    if (!form.vehicleId) {
      setMessage('Select a training vehicle.');
      return;
    }

    if (!form.slotId) {
      setMessage('Select an available training slot.');
      return;
    }

    if (!form.instructorName.trim()) {
      setMessage('Enter the instructor name.');
      return;
    }

    const advance = Number(form.advancePaid || 0);
    if (!Number.isFinite(advance) || advance < 0 || advance > Number(selectedVehicle.totalAmount)) {
      setMessage(`Advance must be between ₹0 and ₹${selectedVehicle.totalAmount}.`);
      return;
    }

    setSaving(true);

    try {
      await onRegister(form);
      onDone();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <div className="form-title">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft />
          Back
        </button>

        <div>
          <h2>Register new student</h2>
          <p>Student ID and training plan are generated automatically.</p>
        </div>
      </div>

      {message && <div className="error-banner form-error">{message}</div>}

      <div className="form-grid">
        <Field label="Student name *">
          <input
            required
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Full name"
          />
        </Field>

        <Field label="Phone number *">
          <input
            required
            maxLength="10"
            inputMode="numeric"
            value={form.phone}
            onChange={(event) =>
              updateField('phone', event.target.value.replace(/\D/g, ''))
            }
            placeholder="10-digit mobile number"
          />
        </Field>

        <Field label="Training vehicle *">
          <select
            required
            value={form.vehicleId}
            onChange={(event) => updateField('vehicleId', event.target.value)}
          >
            <option value="">Select vehicle</option>
            {VEHICLES.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name} — ₹{vehicle.totalAmount} — {vehicle.trainingDays} training days
              </option>
            ))}
          </select>
        </Field>

        <Field label="Training start date *">
          <input
            type="date"
            required
            value={form.startDate}
            onChange={(event) => updateField('startDate', event.target.value)}
          />
        </Field>

        <Field label="Instructor name *">
          <input
            required
            value={form.instructorName}
            onChange={(event) => updateField('instructorName', event.target.value)}
            placeholder="Instructor name"
          />
        </Field>

        <Field label="Advance paid (₹)">
          <input
            type="number"
            min="0"
            max={selectedVehicle?.totalAmount || undefined}
            value={form.advancePaid}
            onChange={(event) => updateField('advancePaid', event.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Fixed training slot *" full>
          {!form.vehicleId ? (
            <div className="slot-help">
              Select a vehicle first to see its available slots.
            </div>
          ) : (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  type="button"
                  key={slot.id}
                  className={`slot-option ${
                    form.slotId === slot.id ? 'selected' : ''
                  } ${!slot.available ? 'occupied' : ''}`}
                  disabled={!slot.available}
                  onClick={() => updateField('slotId', slot.id)}
                >
                  <span>{slot.label}</span>
                  {slot.available ? (
                    <small>
                      <Check size={13} /> Available
                    </small>
                  ) : (
                    <small>
                      <LockKeyhole size={13} /> {slot.student.name}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Address" full>
          <textarea
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
            placeholder="Optional address"
          />
        </Field>

        <Field label="Notes" full>
          <textarea
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder="Optional notes"
          />
        </Field>
      </div>

      {selectedVehicle && (
        <div className="plan">
          <div>
            <span>Selected training</span>
            <b>{selectedVehicle.name}</b>
          </div>
          <div>
            <span>Total amount</span>
            <b>₹{selectedVehicle.totalAmount}</b>
          </div>
          <div>
            <span>Advance paid</span>
            <b>₹{Number(form.advancePaid || 0)}</b>
          </div>
          <div>
            <span>Balance to pay</span>
            <b>₹{Math.max(0, selectedVehicle.totalAmount - Number(form.advancePaid || 0))}</b>
          </div>
          <div>
            <span>Instructor</span>
            <b>{form.instructorName || 'Not selected'}</b>
          </div>
          <div>
            <span>Required training</span>
            <b>{selectedVehicle.trainingDays} days</b>
          </div>
          <div>
            <span>Fixed slot</span>
            <b>{selectedSlot?.label || 'Not selected'}</b>
          </div>
          <div>
            <span>Branch</span>
            <b>{branchName}</b>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="outline" onClick={onBack}>
          Cancel
        </button>

        <button className="primary" type="submit" disabled={saving}>
          {saving ? (
            'Saving...'
          ) : (
            <>
              <CheckCircle2 size={18} />
              Register Student
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children, full = false }) {
  return (
    <label className={full ? 'full' : ''}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Profile({ student, attendance, onAttendance, onPayment, onDelete }) {
  const records = attendance
    .filter((record) => record.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const attended = records.filter(
    (record) => record.status === 'Present'
  ).length;

  const progress = student.requiredDays
    ? Math.min(100, Math.round((attended / student.requiredDays) * 100))
    : 0;

  return (
    <>
      <div className="profile-head panel">
        <div className="avatar large">{student.name[0]}</div>

        <div className="profile-main">
          <div className="eyebrow">{student.id}</div>
          <h2>{student.name}</h2>
          <p>
            {student.phone} · {student.vehicleName} · Instructor: {student.instructorName || '—'} · ⏰{' '}
            {student.slotLabel || 'No slot'} · Started {student.startDate}
          </p>
        </div>

        <div className="profile-actions">
          <StatusBadge status={student.status} />
          <button type="button" className="danger-button" onClick={onDelete}>
            <Trash2 size={16} />
            Delete Student
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat icon={<CheckCircle2 />} label="Attended" value={attended} />
        <Stat icon={<Clock3 />} label="Required" value={student.requiredDays} />
        <Stat
          icon={<CalendarCheck />}
          label="Remaining"
          value={Math.max(0, student.requiredDays - attended)}
        />
        <Stat
          icon={<History />}
          label="Completion"
          value={`${progress}%`}
        />
      </div>

      <PaymentDetails student={student} onPayment={onPayment} />

      <div className="panel">
        <div className="panel-head">
          <h3>Full attendance history</h3>
          <span className="muted">Edit any date</span>
        </div>

        <div className="attendance-list">
          {records.map((record) => (
            <div className="att-row" key={record.id}>
              <b>{formatDate(record.date)}</b>
              <select
                value={record.status}
                onChange={(event) =>
                  onAttendance(student, record.date, event.target.value)
                }
              >
                {ATTENDANCE_STATUS.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
          ))}

          {!records.length && (
            <Empty text="No attendance records yet. Add attendance from Today's Attendance." />
          )}
        </div>
      </div>
    </>
  );
}

function PaymentDetails({ student, onPayment }) {
  const total = Number(student.totalAmount || 0);
  const paid = Number(student.advancePaid || 0);
  const balance = Math.max(0, total - paid);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage('');
  }, [student.id, balance]);

  async function markPaid() {
    if (balance <= 0) return;

    const confirmed = window.confirm(
      `Confirm payment of ₹${balance}?\n\nThis will mark the complete remaining amount as paid.`
    );
    if (!confirmed) return;

    setMessage('');
    setSaving(true);
    try {
      // The button always records the FULL outstanding amount.
      // No manual amount entry is needed, which avoids partial/mismatched payments.
      await onPayment(student, balance);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel payment-panel">
      <div className="panel-head">
        <div>
          <h3>Payment details</h3>
          <p className="muted">
            {balance > 0
              ? `₹${balance} is remaining. Click Paid after the student has paid the full amount.`
              : 'Full payment received. No payment is due.'}
          </p>
        </div>
        {balance > 0 && <span className="payment-due-badge">₹{balance} due</span>}
      </div>

      <div className="plan" style={{ margin: 0 }}>
        <div><span>Total amount</span><b>₹{total}</b></div>
        <div><span>Total paid</span><b>₹{paid}</b></div>
        <div><span>Payment due</span><b>₹{balance}</b></div>
        <div><span>Instructor</span><b>{student.instructorName || '—'}</b></div>
      </div>

      {balance > 0 ? (
        <div className="payment-action payment-action-single">
          <div className="payment-amount-info">
            <span>Remaining amount</span>
            <strong>₹{balance}</strong>
          </div>
          <button type="button" className="primary paid-button" onClick={markPaid} disabled={saving}>
            {saving ? 'Updating...' : `Paid ₹${balance}`}
          </button>
        </div>
      ) : (
        <div className="payment-paid">✓ Paid in full — ₹0 due</div>
      )}

      {message && <div className="error-banner form-error">{message}</div>}
    </div>
  );
}

function ConfirmDeleteModal({ student, deleting, onCancel, onConfirm }) {
  // The Escape key closes the dialog, like clicking "No, Keep Student".
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="confirm-modal">
        <div className="confirm-icon">
          <Trash2 size={22} />
        </div>

        <h3 id="delete-title">Delete student?</h3>
        <p>
          Are you sure you want to delete <b>{student.name}</b> ({student.id})?
        </p>
        <p className="confirm-warning">
          This will permanently remove the student and all their attendance
          records{student.slotLabel ? `, and free the ${student.slotLabel} slot` : ''}.
          This action cannot be undone.
        </p>

        <div className="confirm-actions">
          <button
            type="button"
            className="outline"
            onClick={onCancel}
            disabled={deleting}
            autoFocus
          >
            No, Keep Student
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onConfirm}
            disabled={deleting}
          >
            <Trash2 size={16} />
            {deleting ? 'Deleting...' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Attendance({ students, attendance, onSave }) {
  const [date, setDate] = useState(today());
  const [search, setSearch] = useState('');

  function getStatus(studentId) {
    return (
      attendance.find(
        (record) => record.studentId === studentId && record.date === date
      )?.status || ''
    );
  }

  const searchText = search.toLowerCase();
  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.phone} ${student.id}`
      .toLowerCase()
      .includes(searchText)
  );

  return (
    <div className="panel">
      <div className="toolbar attendance-toolbar">
        <div>
          <h3>Daily attendance</h3>
          <p className="muted">
            Choose any date and update each student's status.
          </p>
        </div>

        <input
          className="date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>

      <div className="attendance-search search">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student name, phone or student ID..."
        />
      </div>

      <div className="attendance-table">
        {filteredStudents.map((student) => (
          <div className="attendance-card" key={student.id}>
            <div className="person">
              <div className="avatar">{student.name[0]}</div>
              <div>
                <b>{student.name}</b>
                <span>
                  {student.id} · {student.phone} · {student.vehicleName}
                  <small className="slot-inline">
                    ⏰ {student.slotLabel || 'No slot'}
                  </small>
                </span>
              </div>
            </div>

            <div className="att-buttons">
              {ATTENDANCE_STATUS.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={
                    getStatus(student.id) === status
                      ? `selected ${status.toLowerCase()}`
                      : ''
                  }
                  onClick={() => onSave(student, date, status)}
                >
                  {status === 'Present' ? '✓ ' : '↻ '}
                  {status}
                </button>
              ))}
            </div>
          </div>
        ))}

        {!filteredStudents.length && (
          <Empty
            text={
              search
                ? 'No matching active students.'
                : 'No active students.'
            }
          />
        )}
      </div>
    </div>
  );
}

function HistoryPage({ students, onOpen }) {
  const [search, setSearch] = useState('');
  const searchText = search.toLowerCase();

  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.phone} ${student.id}`
      .toLowerCase()
      .includes(searchText)
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Completed students</h3>
          <p className="muted">
            Completed profiles remain here with their complete training history.
          </p>
        </div>
      </div>

      <div className="history-search search">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search completed student name, phone or student ID..."
        />
      </div>

      {filteredStudents.map((student) => (
        <div
          className="history-card"
          onClick={() => onOpen(student)}
          key={student.id}
        >
          <div className="avatar">{student.name[0]}</div>
          <div>
            <b>{student.name}</b>
            <span>
              {student.id} · {student.phone} · {student.vehicleName} ·{' '}
              {student.requiredDays} training days · ⏰{' '}
              {student.slotLabel || 'No slot'}
            </span>
          </div>
          <StatusBadge status={student.status} />
          <ChevronRight />
        </div>
      ))}

      {!filteredStudents.length && (
        <Empty
          text={
            search
              ? 'No matching completed students.'
              : 'No completed students yet.'
          }
        />
      )}
    </div>
  );
}

// All 30 slots of one vehicle, each marked with the active student holding it.
// Completed students are not active, so their slot becomes free automatically.
function slotsFor(vehicleId, activeStudents) {
  return SLOTS.map((slot) => {
    const bookedBy = activeStudents.find(
      (student) => student.vehicleId === vehicleId && student.slotId === slot.id
    );

    return { ...slot, available: !bookedBy, student: bookedBy || null };
  });
}

function SlotsPage({ students, onOpen }) {
  // 'all' shows every car side by side; one car is easier to read on a phone.
  const [vehicleId, setVehicleId] = useState('all');
  const shownVehicles =
    vehicleId === 'all'
      ? VEHICLES
      : VEHICLES.filter((vehicle) => vehicle.id === vehicleId);

  const slotsByVehicle = Object.fromEntries(
    VEHICLES.map((vehicle) => [vehicle.id, slotsFor(vehicle.id, students)])
  );

  return (
    <div className="panel">
      <div className="panel-head slots-header">
        <div>
          <h3>Fixed training slots</h3>
          <p className="muted">
            Each student gets one fixed 30-minute slot and keeps it for the
            full training period. Updates automatically.
          </p>
        </div>

        <select
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          <option value="all">All vehicles</option>
          {VEHICLES.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>
      </div>

      <div className="slot-summary-row">
        {VEHICLES.map((vehicle) => {
          const free = slotsByVehicle[vehicle.id].filter(
            (slot) => slot.available
          ).length;

          return (
            <button
              type="button"
              key={vehicle.id}
              className={`slot-summary ${
                vehicleId === vehicle.id ? 'active' : ''
              }`}
              onClick={() =>
                setVehicleId(vehicleId === vehicle.id ? 'all' : vehicle.id)
              }
            >
              <b>{vehicle.name}</b>
              <span>
                {free} available · {SLOTS.length - free} booked
              </span>
            </button>
          );
        })}
      </div>

      <div className="table-wrap">
        <table className="slot-table">
          <thead>
            <tr>
              <th>Time</th>
              {shownVehicles.map((vehicle) => (
                <th key={vehicle.id}>{vehicle.name}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {SLOTS.map((slot, index) => (
              <tr key={slot.id}>
                <td className="slot-time">
                  <Clock size={15} />
                  <b>{slot.label}</b>
                </td>

                {shownVehicles.map((vehicle) => {
                  const cell = slotsByVehicle[vehicle.id][index];

                  return (
                    <td key={vehicle.id}>
                      {cell.available ? (
                        <span className="slot-status free-status">
                          Available
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="slot-status booked-status"
                          onClick={() => onOpen(cell.student)}
                          title="Open student profile"
                        >
                          {cell.student.name} · {cell.student.id}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="slot-note">
        When a student completes the required training days, the student moves
        to Student History and the slot automatically becomes available for the
        next student.
      </div>
    </div>
  );
}

function Vehicles() {
  return (
    <div className="vehicle-grid">
      {VEHICLES.map((vehicle) => (
        <div className="vehicle panel" key={vehicle.id}>
          <div className="vehicle-icon">
            <CarFront />
          </div>

          <h3>{vehicle.name}</h3>
          <p>Training duration</p>
          <strong className="duration">
            {vehicle.trainingDays} days
          </strong>

          <div className="vehicle-note">
            This car is available as a training option for any student. It is
            not treated as a shared booking slot.
          </div>
        </div>
      ))}
    </div>
  );
}

function Progress({ student, attendance }) {
  const records = attendance.filter(
    (record) =>
      record.studentId === student.id && record.status === 'Present'
  );

  // Never display more than the required training days.
  const attended = Math.min(student.requiredDays, records.length);
  const percentage = student.requiredDays
    ? Math.min(100, (attended / student.requiredDays) * 100)
    : 0;

  return (
    <div className="progress">
      <div>
        <span>
          {attended}/{student.requiredDays}
        </span>
      </div>
      <i>
        <em style={{ width: `${percentage}%` }} />
      </i>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`badge ${String(status).toLowerCase()}`}>
      {status}
    </span>
  );
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
