# Salary Tracker

A comprehensive salary and attendance management application built with React, TypeScript, and Firebase. This application allows organizations to manage employees, track attendance, calculate payroll, and generate payslips.

## Features

-   **Dashboard Overview**: Get a quick snapshot of total employees, monthly payout, and attendance stats.
-   **Employee Management**: Add, edit, and delete employee profiles with detailed information including role, department, and salary.
-   **Attendance Tracking**:
    -   Daily attendance marking (Present, Absent, Half-day, Leave).
    -   Visual calendar view of attendance history.
    -   Support for overtime hours.
-   **Payroll Calculation**:
    -   Automated salary calculation based on attendance and working days.
    -   Configurable deductions and overtime multipliers.
    -   Generate and print detailed payslips.
    -   Export monthly payroll data to XLS.
-   **Department Filtering**: Filter employees and payroll data by department (Engineering, Sales, Marketing, HR, Finance, Operations, Labor).
-   **Authentication**: Secure Google Authentication via Firebase.
-   **Responsive Design**: optimized for both desktop and mobile devices.

## Tech Stack

-   **Frontend**: React, TypeScript, Vite
-   **Styling**: Tailwind CSS
-   **Backend / Database**: Firebase (Authentication & Firestore)
-   **Routing**: React Router DOM (implied)
-   **Charts**: Recharts
-   **Icons**: Lucide React
-   **Utilities**: date-fns, html2canvas, jspdf

## Prerequisites

-   Node.js (v18 or higher recommended)
-   npm or yarn
-   A Firebase project

## Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/codeREDxbt/PayTrack.git
    cd SalaryTracker
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Firebase Configuration:**
    -   Create a project in the [Firebase Console](https://console.firebase.google.com/).
    -   Enable **Authentication** and set up the **Google** sign-in provider.
    -   Create a **Firestore Database** in production mode.
    -   Create a `.env` file in the root directory and add your Firebase configuration keys:

    ```env
    VITE_FIREBASE_API_KEY=your_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    VITE_FIREBASE_APP_ID=your_app_id
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

## Scripts

-   `npm run dev`: Starts the development server.
-   `npm run build`: Builds the app for production.
-   `npm run lint`: Runs ESLint to check for code quality issues.
-   `npm run preview`: Locally preview the production build.

## Project Structure

```
src/
├── components/     # Reusable UI components
├── contexts/       # React Contexts (Auth, App state)
├── hooks/          # Custom React hooks
├── lib/            # Utilities and configurations (Firebase, types)
├── pages/          # Application pages (People, Payroll, etc.)
└── utils/          # Helper functions
```

## License

This project is for personal use.
