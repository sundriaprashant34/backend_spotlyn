# Spotlyn – College Complaint & Lost/Found Management System

Spotlyn is a full-stack college campus platform for reporting, assigning, tracking and resolving campus complaints, plus managing lost and found items.

## Stack

- Frontend: React 18, Vite, Tailwind CSS, React Router, Axios
- Backend: Node.js, Express
- Database: MongoDB + Mongoose
- Authentication: JWT + bcryptjs
- Uploads: Multer + Cloudinary

## Roles

- **Student:** register/login, automatic enrollment number, submit complaints, upload images, track status, report lost/found items.
- **Staff:** see assigned complaints, start work, mark resolved.
- **Admin:** dashboard, verify/reject, assign department/staff, manage staff accounts, monitor complaints and statistics.

## Complaint flow

`Submitted → Verified → Assigned → In Progress → Resolved`

Rejected complaints use `Rejected` status.

## Notifications

Complaint verification, assignment, and status changes create in-app notifications.

## Setup

### 1. Install

From the project root:

```bash
npm install
```

### 2. Configure backend

Copy:

```text
backend/.env.example → backend/.env
```

Set at least:

```env
MONGO_URI=mongodb://127.0.0.1:27017/spotlyn
JWT_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM_EMAIL=your_verified_sender@example.com
BREVO_FROM_NAME=Spotlyn
```

Create a Cloudinary account and copy these three values from the Cloudinary Console. Complaint and lost/found report images (up to 5 MB) are stored in the `spotlyn` Cloudinary folder. Keep the API secret private and only in `backend/.env`.
Create a Groq API key and keep it private in `backend/.env`. The Spotlyn AI chat endpoint uses Groq and requires `GROQ_API_KEY`; `GROQ_MODEL` is optional.
Create a Brevo API key and verify the sender address in Brevo. Student welcome emails are sent after a student's first successful login. Keep `BREVO_API_KEY` private in `backend/.env`.

Admin and staff seed accounts are optional. Set their email and password variables in `backend/.env` to create them. Use strong, private passwords outside development.

The optional staff seed account uses the `STAFF_EMAIL` and `STAFF_PASSWORD` values. If these are blank, no seed staff account is created; admins can add staff from `/admin/staff`.

### 3. Configure frontend

Copy `frontend/.env.example` to `frontend/.env`. The default `/api` value uses the Vite development proxy; set `VITE_API_BASE_URL` to your deployed API URL in production.

### 4. Run backend

```bash
npm run server
```

### 5. Run frontend in another terminal

```bash
npm run dev
```

Or run both:

```bash
npm run fullstack
```

## Main routes

- `/login`
- `/register`
- `/dashboard`
- `/report-problem`
- `/my-reports`
- `/lost-item`
- `/found-item`
- `/profile`
- `/admin`
- `/admin/staff`
- `/admin/students`
- `/admin/lost-found`
- `/staff`

## Staff accounts

Admins can add staff from `/admin/staff` by entering a name, selecting a designation, and choosing a password of at least 8 characters. The app generates a login ID from the designation, such as `lab-technician@spotlyn.local`; if that ID is already taken, it adds the staff member's name (for example, `network-technician-rahul-sharma@spotlyn.local`) and a number if needed to keep it unique. These `.local` IDs are for logging into Spotlyn and are not Gmail inboxes.

Admins can edit a staff member's name and designation, and optionally set a new password. Changing the designation also changes the generated login ID. Deleting a staff account deactivates it, preserving complaint history while preventing further login.

## Backend API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/ai/chat`
- `POST /api/complaints`
- `GET /api/complaints`
- `GET /api/complaints/mine`
- `GET /api/complaints/:id`
- `PUT /api/complaints/:id/verify`
- `PUT /api/complaints/:id/assign`
- `PUT /api/complaints/:id/status`
- `POST /api/lost-found/lost`
- `POST /api/lost-found/found`

## Deploy from GitHub

Push this project as one GitHub repository. The `backend` and `frontend` folders are standalone deploy roots.

### Render (backend)

1. Create a **Web Service** from the GitHub repository.
2. Set **Root Directory** to `backend`.
3. Use **Build Command** `npm ci --omit=dev --workspaces=false` and **Start Command** `npm start`.
4. Add these environment variables in Render (do not upload `.env`):
   - `MONGO_URI`: your MongoDB Atlas connection string; allow Render's outbound IPs in Atlas, or configure Atlas network access as appropriate.
   - `JWT_SECRET`: a long, private random value.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
   - `CLIENT_URL`: the deployed Vercel frontend origin, for example `https://your-project.vercel.app`.
   - Optional: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STAFF_EMAIL`, `STAFF_PASSWORD`.
5. After deployment, verify `https://<your-render-service>.onrender.com/api/health`.

### Vercel (frontend)

1. Import the same GitHub repository as a Vercel project.
2. Set **Root Directory** to `frontend`.
3. Use the Vite defaults: build command `npm run build`, output directory `dist`, install command `npm install`.
4. Add `VITE_API_BASE_URL` for Production and Preview, set to `https://<your-render-service>.onrender.com/api`.
5. Copy the Vercel production domain into Render's `CLIENT_URL`, then redeploy the backend.

The frontend Vercel configuration includes SPA rewrites so direct links such as `/admin` work after refresh. Local Vite development continues to use the `/api` proxy.

- `GET /api/lost-found/lost`
- `GET /api/lost-found/found`
- `GET /api/admin/stats`
- `GET /api/users/staff`
- `PUT /api/users/staff/:id`
- `DELETE /api/users/staff/:id`
- `GET /api/users/students`
- `POST /api/users/staff` (admin creates an account with a unique designation-based `@spotlyn.local` login ID)

## Important

MongoDB credentials are environment-specific and should be configured in `backend/.env`. The backend creates the optional seed admin/staff accounts on startup only when their email and password variables are set in `backend/.env`.
