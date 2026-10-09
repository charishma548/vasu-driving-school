// ============================================================
// VASU DRIVING SCHOOL - APP SETTINGS
// Change branch names, vehicle names, or training days here.
// ============================================================

export const BRANCHES = [
  { id: 'tagarapuvalasa', name: 'Tagarapuvalasa' },
  { id: 'ananthapuram', name: 'Ananthapuram' },
];

export const VEHICLES = [
  { id: 'alto', name: 'Alto 800', trainingDays: 18, totalAmount: 5500 },
  { id: 'swift', name: 'Swift', trainingDays: 20, totalAmount: 7000 },
  { id: 'dzire', name: 'Swift Dzire', trainingDays: 20, totalAmount: 7000 },
];

export const ATTENDANCE_STATUS = ['Present', 'Rescheduled'];

// 5:00 AM to 8:00 PM in 30-minute intervals = 30 fixed slots.
// Keep this in sync with SLOTS in backend/server.js.
export const SLOTS = Array.from({ length: 30 }, (_, index) => {
  const startMinutes = 5 * 60 + index * 30;
  const endMinutes = startMinutes + 30;

  const formatTime = (minutes) => {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
  };

  return {
    id: `slot-${index + 1}`,
    start: formatTime(startMinutes),
    end: formatTime(endMinutes),
    label: `${formatTime(startMinutes)} – ${formatTime(endMinutes)}`,
  };
});

// In development the backend runs on port 5000.
// In production the backend serves this website, so the API is on the same domain.
// Set VITE_API_URL only if the frontend is hosted separately from the backend.
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

// Today's date in the user's local time zone (YYYY-MM-DD).
// toISOString() would use UTC and show yesterday's date before 5:30 AM in India.
export const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};
