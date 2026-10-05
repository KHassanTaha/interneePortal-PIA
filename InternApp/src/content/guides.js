export const GUIDE_CATEGORIES = {
  APP: 'App Guide',
  DEPARTMENT: 'Department Guide',
  COMPANY: 'Company Guide',
};

export const guides = [
  {
    id: 'app-welcome',
    title: 'Welcome to PIA Intern System',
    category: GUIDE_CATEGORIES.APP,
    icon: 'home',
    content: [
      {heading: 'Getting Started', body: 'Welcome to the PIA Intern System! This app helps you manage your internship tasks, attendance, documents, and communication with your mentor.'},
      {heading: 'Your Dashboard', body: 'The dashboard shows your internship progress, today\'s attendance status, pending tasks, and quick actions. Pull to refresh anytime.'},
      {heading: 'Notifications', body: 'Tap the bell icon in the header to view notifications about approvals, task assignments, shift changes, and other updates.'},
      {heading: 'Sidebar Menu', body: 'Tap the menu icon (≡) to access all screens. Use the sidebar to navigate between dashboards, attendance, tasks, documents, reports, and more.'},
    ],
  },
  {
    id: 'app-attendance',
    title: 'Attendance & Face Recognition',
    category: GUIDE_CATEGORIES.APP,
    icon: 'mapPin',
    content: [
      {heading: 'Marking Attendance', body: 'Navigate to Attendance from the sidebar. The app verifies your location against your department\'s geofence and your face against your enrolled profile.'},
      {heading: 'Face Enrollment', body: 'Before marking attendance, you must register your face. Go to Profile > Register Face, or follow the prompt on your dashboard. Your face photo will be reviewed by your mentor or admin.'},
      {heading: 'Late Arrival / Early Departure', body: 'Arriving after the shift start or leaving before the shift end may result in a Late or Early Departure status. Your mentor can view detailed attendance logs.'},
      {heading: 'On Leave', body: 'If your leave application is approved, the system will mark you as on leave for those dates. Apply for leave via the sidebar.'},
    ],
  },
  {
    id: 'app-documents',
    title: 'Documents & Certificates',
    category: GUIDE_CATEGORIES.APP,
    icon: 'folder',
    content: [
      {heading: 'Upload Documents', body: 'Go to Upload Documents to submit your CNIC, CV/Resume, an optional University ID and optional NOC (No Objection Certificate). Only image files (jpg/png) are accepted for CNIC and University ID. CV/Resume, NOC and Internship Report accept PDF or image files. Max 5 MB per file.'},
      {heading: 'Document Requests', body: 'Request gate passes, ID cards, or certificates via the Document Requests screen. Your mentor or admin will review and approve/reject your request.'},
      {heading: 'Approved Documents', body: 'Once a document is approved, you cannot re-upload it unless it is deleted by an admin or mentor. Withdraw a pending document if you need to make changes.'},
    ],
  },
  {
    id: 'app-tasks',
    title: 'Tasks',
    category: GUIDE_CATEGORIES.APP,
    icon: 'clipboard',
    content: [
      {heading: 'Viewing Tasks', body: 'Your assigned tasks appear under My Tasks. Each task has a status (Pending, In Progress, Completed, Overdue) and an optional deadline.'},
      {heading: 'Updating Task Status', body: 'Tap a task to view details and update its status. Mark tasks as In Progress when you start working, and Completed when finished.'},
    ],
  },
  {
    id: 'app-transfers',
    title: 'Transfers & Shift Changes',
    category: GUIDE_CATEGORIES.APP,
    icon: 'transfer',
    content: [
      {heading: 'Transfer Requests', body: 'If you need to transfer to a different department or mentor, submit a transfer request. Your current mentor and the admin must approve it.'},
      {heading: 'Shift Changes', body: 'Your mentor may propose a shift change. You will receive a notification and must accept or reject it.'},
    ],
  },
  {
    id: 'app-device-macs',
    title: 'Device MAC Addresses',
    category: GUIDE_CATEGORIES.APP,
    icon: 'key',
    content: [
      {heading: 'Why Submit MAC Addresses?', body: 'Your laptop and phone MAC addresses are used for device verification during attendance. Submit them via the Device MACs screen.'},
      {heading: 'Finding Your MAC Address', body: 'On Windows: open Command Prompt and type ipconfig /all. Look for "Physical Address" under your network adapter. On Mac: go to System Preferences > Network > Advanced > Hardware. On Android/iOS: check your Wi-Fi settings.'},
      {heading: 'Format', body: 'MAC addresses should be in the format AA:BB:CC:DD:EE:FF (6 pairs of hexadecimal characters separated by colons).'},
    ],
  },
  {
    id: 'app-reports',
    title: 'Reports',
    category: GUIDE_CATEGORIES.APP,
    icon: 'file',
    content: [
      {heading: 'Viewing Reports', body: 'Your mentor and admin can generate attendance and task reports. You can view your own summary in the Reports section.'},
      {heading: 'Exporting Reports', body: 'Reports can be exported as PDF or Excel files. Tap the export button and choose your preferred format.'},
    ],
  },
  {
    id: 'dept-template',
    title: 'Department Guide — Template',
    category: GUIDE_CATEGORIES.DEPARTMENT,
    icon: 'building',
    content: [
      {heading: 'Department Overview', body: '[Edit this section with your department name and description.]'},
      {heading: 'Key Contacts', body: '[List your department head, mentor, and admin contacts.]'},
      {heading: 'Working Hours', body: '[Specify your department\'s standard working hours, break times, and any department-specific rules.]'},
      {heading: 'Important Notes', body: '[Add any department-specific policies, procedures, or guidelines for interns.]'},
    ],
  },
  {
    id: 'company-template',
    title: 'Company Guide — Template',
    category: GUIDE_CATEGORIES.COMPANY,
    icon: 'briefcase',
    content: [
      {heading: 'About PIA', body: '[Edit this section with your company overview.]'},
      {heading: 'Code of Conduct', body: '[Add your company\'s code of conduct for interns.]'},
      {heading: 'Office Facilities', body: '[Describe available facilities: cafeteria, parking, Wi-Fi, etc.]'},
      {heading: 'Emergency Contacts', body: '[List emergency contacts and procedures.]'},
    ],
  },
];