# Vasu Driving School - Code Guide

This project is intentionally organized so that you can understand and edit it easily.

## Frontend folder

```text
frontend/
└── src/
    ├── App.jsx        # All screens and React components
    ├── api.js         # All calls from React to Express
    ├── config.js      # Branches, vehicles, training days, API URL
    ├── main.jsx       # React entry point
    └── styles.css     # Complete website styling
```

## Where to change colors

Open:

```text
frontend/src/styles.css
```

At the very top you will find:

```css
:root {
  --bg: #f7f8fa;
  --card: #ffffff;
  --ink: #17202a;
  --muted: #697586;
  --line: #e7e9ee;
  --accent: #e36b35;
  --accent2: #f08a5b;
  --green: #238b63;
  --red: #c94b4b;
  --blue: #4667c9;
}
```

For example, to change the orange theme, change:

```css
--accent: #e36b35;
```

to another color such as:

```css
--accent: #2563eb;
```

Most buttons, highlights and progress bars use `var(--accent)`, so one change updates the main theme.

## Where to change branches and cars

Open:

```text
frontend/src/config.js
```

Current vehicles:

- Alto 800 -> 18 days
- Swift -> 20 days
- Swift Dzire -> 20 days

If the training days change in the future, change only `config.js` and the backend vehicle configuration.

## Attendance logic

Only these attendance statuses are used:

- Present
- Rescheduled

Absent and Holiday are intentionally not included.

When Present attendance reaches the required number of training days:

```text
20 / 20
    ↓
Completed
    ↓
Removed from Students
    ↓
Removed from Attendance
    ↓
Shown in Student History
```

The backend is responsible for enforcing this rule, so the frontend cannot create `21/20` progress.

## Backend

```text
backend/
├── server.js       # Express API and database logic
├── data/db.json    # Local testing database
└── .env.example    # MongoDB configuration example
```

The project can run with the local JSON database for testing. MongoDB Atlas can be enabled later using `MONGODB_URI` in `backend/.env`.
