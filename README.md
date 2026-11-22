# Integrated Reservation, Sales, and Inventory Management System

A beginner-friendly student project built with HTML, CSS, JavaScript, Node.js, Express.js, and MySQL/MariaDB.

## Main features

- Sign Up and Sign In. The first account registered becomes the Owner; later accounts become Staff.
- Passwords are saved as hashes using bcryptjs.
- Dashboard with reservation, daily sales, inventory, and low-stock summaries.
- Reservation records with add, edit, cancel, and exact date/time double-booking prevention.
- Sales / POS with transaction history. If the item name matches an inventory item, stock is deducted automatically.
- Inventory with add, edit, delete, and low-stock status.
- Daily, last-7-days, and monthly reports.
- Owner-only user list and activity log.

## Requirements

- Node.js (LTS version)
- MySQL or MariaDB (XAMPP is okay)
- Visual Studio Code or another code editor

## Setup

1. Extract the ZIP file.
2. Start MySQL using XAMPP or your installed MySQL/MariaDB service.
3. Open phpMyAdmin, select the **Import** tab, and import `database/database.sql`.
   - The SQL file creates the `integrated_management_system` database and its tables.
4. Open this project folder in VS Code.
5. Open the terminal in the project folder and run:

   ```bash
   npm install
   ```

6. Copy `.env.example` and rename the copy to `.env`.
7. Open `.env` and set your MySQL username and password. For a usual XAMPP setup, the default is often `root` with an empty password:

   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=integrated_management_system
   SESSION_SECRET=change-this-to-a-long-random-secret
   ```

8. Start the project:

   ```bash
   npm start
   ```

9. Open this address in your browser: `http://localhost:3000`.

## First account and roles

- The first person to sign up becomes the **Owner**.
- Additional accounts created using Sign Up become **Staff**.
- The Owner can open User Management to view accounts and the activity log.
- Keep the first Owner account details safe. This beginner version does not include a password reset feature.

## How to record a sale

1. Add the product to Inventory first.
2. Go to Sales / POS.
3. Enter the exact same product name, quantity, and price.
4. When the sale is saved, the system checks the inventory and deducts the sold quantity.
5. If there is not enough stock, the sale is not saved.

A sale can also be recorded for a service or item that is not in Inventory. In that case, no stock is deducted.

## Important notes for a student project

- This project uses straightforward JavaScript and Express routes to make the code easier to study.
- Session data uses Express's built-in MemoryStore, which is suitable only for a classroom/demo project. For a real deployment, use a persistent session store and HTTPS.
- Configure a strong `SESSION_SECRET` before using the system beyond a local demo.
- Double-booking prevention checks for another confirmed booking at the exact same date and time. If your business needs booking durations or table/room capacity, those rules should be added.
- Reports use the server/database date and time.
- Always back up the database before making major changes.

## Folder structure

```text
integrated_management_system/
├── database/
│   └── database.sql
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .env.example
├── package.json
├── README.md
└── server.js
```
