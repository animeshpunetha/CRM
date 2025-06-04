# CRM Web Application

Organizations often rely on multiple disconnected tools—spreadsheets, shared drives, generic scheduling apps—to manage contacts and sales workflows. This fragmentation leads to missed follow-ups, inaccurate forecasting, and wasted time. Moreover, many out-of-the-box CRMs are either overly complex or too expensive for small and mid-sized teams.

This CRM brings all critical sales workflows under one roof. Every stakeholder—whether admin, sales rep, or manager—has instant access to the data they need. The modular architecture means you can enable only the features you need, keeping the interface clean and the learning curve low.
A full-stack **Customer Relationship Management (CRM)** web application built using **Node.js**, **Express.js**, **MongoDB**, and **EJS**. This system is designed to help sales teams manage leads, deals, contacts, accounts, and recurring revenue streams effectively.

---

## 🚀 Features

### ✅ Core Modules

- **Authentication**:
  - Secure login & registration
  - Role-based access (`admin`, `user`)
  
- **Leads Management**:
  - Create, view, update, and delete leads
  - Assign leads to sales reps

- **Deals Module**:
  - Track deals with stages & probabilities
  - View Kanban board based on deal stages
  - Excel import/export supported

- **Contacts & Accounts**:
  - Manage contacts and company accounts
  - Associate contacts and accounts with deals/leads

- **Recurring Payments**:
  - Track subscription/recurring payments
  - Import recurring payments via Excel

- **Dashboard (Admin)**:
  - KPIs like total leads, total deals, lead conversion rate
  - Visual charts for user-wise activities
  - Monthly sales targets vs achieved

---

## 🛠 Tech Stack

| Layer         | Technology                       |
|---------------|----------------------------------|
| Backend       | Node.js, Express.js              |
| Frontend      | EJS Templates, Bootstrap         |
| Database      | MongoDB (with Mongoose)          |
| Auth          | Passport.js, bcrypt              |
| File Uploads  | Multer (in-memory)               |
| Excel Support | exceljs                          |
| Charts        | Chart.js                         |

---

## 📦 Installation

### 1. Clone the repository
```bash
git clone https://github.com/your-username/crm-app.git
cd crm-app
```
### 2. Install dependencies
```bash
npm install
```

### 3. Setup .env
Create a .env file in the root directory:
```
PORT = 3000
MONGODB_URI = "mongodb://localhost:27017/crm_app"
SESSION_SECRET = '62c73347cd9bfba9137fe5efe92179ab78ba11db0ab39622b3bae6e779a107ae539f9b8affe53191b2e28f3bb37aeaaff533796b7488bee753fb6663591083d6'
MAIL_USER=your_smtp_username
MAIL_PASS=your_smtp_password_or_app_password
PORTAL_MANAGER_EMAIL=portal‐manager@example.com
```

### 4. Insert the admin details for login in the database in user collection
```
{
  "name": "Admin",
  "email": "admin@team1.com",
  "password": "$2b$10$kD6gwFGIxo6ZrlhR58RSTOXUW6EZ0yu.1oLhpgYBmblD64dP9Fu0G",
  "role": "super_admin",
  "emp_id": "Admin001",
  "manager_id": "Admin001",
  "createdAt": {
    "$date": "2025-06-03T05:21:34.398Z"
  },
  "__v": 0
}
```

### 5. Run the application
Run the command
```
npm run dev
```

### 6. Login Credentials
```
username : admin@team1.com
password : 12345678
```
---
## Dashboard Visuals
  - Secure login & registration
  - Lead-to-deal conversion pie chart
  - User-wise deal/lead bar graph
  - Monthly sales targets and performance
  - System-wide KPIs

---
## Author
- Animesh Punetha
Final Year Engineering Student @ NIT Durgapur
---

