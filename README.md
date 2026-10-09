# Vasu Driving School

React + Vite frontend with a Node.js + Express backend.

## Main features

- Two branches: Tagarapuvalasa and Ananthapuram
- New student registration
- Automatic branch-wise student ID: Tagarapuvalasa = VS-TAG-001, VS-TAG-002… and Ananthapuram = VS-ANA-001, VS-ANA-002…
- Alto 800: 18 training days
- Swift: 20 training days
- Swift Dzire: 20 training days
- Flexible attendance: Present / Rescheduled
- Attendance search
- Student search
- Completed student history search
- Automatic completion at exactly the required number of Present days
- Completed students disappear from Students and Attendance and move to Student History
- Delete a student (with confirmation): removes the student and their attendance, frees their slot, and never reuses their ID
- Fixed 30-minute training slots (5:00 AM to 8:00 PM) per branch and vehicle
- Local JSON database for easy testing
- Optional MongoDB Atlas support

## Project structure

```text
vasu-final-complete/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── config.js
│   │   ├── main.jsx
│   │   └── styles.css
│   └── package.json
│
├── backend/
│   ├── data/db.json
│   ├── server.js
│   └── package.json
│
├── package.json
├── CODE-GUIDE.md
└── START-HERE.txt
```

## Run locally

From the project root:

```bash
npm run install:all
```

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

Backend health check:

```text
http://localhost:5000/api/health
```

## Host it as a real website

The backend also serves the built React website, so the whole app is hosted as
**one service** (for example on Render, Railway or any VPS with Node.js 20+).

1. Create a free MongoDB Atlas database and copy its connection string.
   Do not host with the JSON file database: most hosting platforms erase local
   files on every restart or redeploy, which would delete all students.
2. On the hosting platform, set these environment variables:

   ```env
   NODE_ENV=production
   APP_PASSWORD=choose-a-strong-staff-password
   MONGODB_URI=your_mongodb_connection_string
   TIME_ZONE=Asia/Kolkata
   ```

3. Use these commands (run from the project root):

   ```text
   Build command:  npm run build
   Start command:  npm start
   ```

4. Open the website address and log in with `APP_PASSWORD`.

The server refuses to start in production without `APP_PASSWORD`, so student
data is never left publicly open. Changing `APP_PASSWORD` logs everyone out.

Hosting the frontend separately (e.g. Netlify) is also possible: set
`VITE_API_URL=https://your-backend-domain/api` for the frontend build and
`CORS_ORIGIN=https://your-frontend-domain` on the backend.

## MongoDB Atlas

MongoDB is optional for local testing. The backend automatically uses the JSON file when `MONGODB_URI` is not set.

To use MongoDB Atlas, create `backend/.env`:

```env
PORT=5000
APP_PASSWORD=your_staff_password
MONGODB_URI=your_mongodb_connection_string
```

See `backend/.env.example` for all settings.

Then restart the backend.

## Customization

For colors, edit the `:root` variables at the top of `frontend/src/styles.css`.

For branches, vehicles and training days, edit `frontend/src/config.js` and the matching backend configuration in `backend/server.js`.

See `CODE-GUIDE.md` for a simple map of the code.

## Fixed Training Slots

- Training time is **5:00 AM to 8:00 PM**: **30 slots** of 30 minutes each.
- A student picks **one fixed slot** at registration and keeps it for every training day.
- A slot is unique per **branch + vehicle**, so different cars can train different students at the same time.
- When a student completes all required days, they move to Student History and the slot becomes free automatically.
- The server double-checks every booking, so two staff can never book the same slot at the same moment.
- If a completed student's attendance is changed so their training would reopen, this is blocked when their old slot already belongs to a new student.
- The Training Slots page shows all vehicles side by side and refreshes automatically every 30 seconds.
- To change slot times, edit `SLOTS` in both `frontend/src/config.js` and `backend/server.js`.
