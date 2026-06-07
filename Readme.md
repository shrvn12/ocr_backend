# OCR-Based Document Processing System

## Overview

This project is an OCR-assisted document processing system designed for carbon-credit workflows. Field operators capture weighbridge slips and supporting documents, OCR extracts structured information, and reviewers verify and approve records before they are finalized.

The system focuses on:

* Offline-capable field data collection
* OCR-assisted extraction
* Human verification workflows
* Complete auditability
* Searchable historical records

---

## Live Demo

Frontend: https://ocr-frontend-efr1.onrender.com

Backend: https://ocr-backend-f4ls.onrender.com

GitHub Repository Frontend: https://github.com/shrvn12/ocr_frontend

GitHub Repository Backend: https://github.com/shrvn12/ocr_backend

---

## Test Credentials

### Admin

Email: [admin@example.com](mailto:admin@example.com)

Password: Admin@1234

### Reviewer

Email: [reviewer@example.com](mailto:reviewer@example.com)

Password: Review@1234

### Uploader

Email: [uploader@example.com](mailto:uploader@example.com)

Password: Upload@1234

---

## Features

### Authentication & Authorization

* JWT-based authentication
* Role-based access control
* Admin, Reviewer, and Uploader roles

### Document Capture

* Mobile-friendly capture workflow
* Image upload
* Cloudinary storage
* Batch upload support

### OCR Processing

* Google Vision API integration
* Vehicle number extraction
* Weight extraction
* Date extraction
* Confidence scoring

### Review Workflow

* Human verification of OCR output
* Field correction support
* Approval and rejection workflows
* Mandatory audit notes

### Audit Logging

* Tracks every field modification
* Tracks approvals and rejections
* Stores user, timestamp, old value, and new value

### Search & Discovery

* Search by vehicle number
* Search by status
* Search by confidence
* Search by date range

### Dashboard

* Total documents
* Pending OCR
* Pending Review
* Approved
* Rejected

### Offline Support

* Progressive Web App (PWA)
* IndexedDB-based offline storage
* Automatic synchronization when connectivity returns
* Network status monitoring

---

## Technology Stack

### Frontend

* Vue 3
* Vite
* Pinia
* Vue Router
* IndexedDB
* PWA

### Backend

* Node.js
* Express.js
* Prisma ORM
* JWT Authentication
* Multer

### Database

* PostgreSQL (Neon)

### OCR

* Google Vision API

### Storage

* Cloudinary

### Deployment

* Render
* Neon
* Cloudinary

---

## System Architecture

Field Operator
→ Capture Document
→ Cloudinary Storage
→ OCR Processing
→ Field Extraction
→ Confidence Scoring
→ Review Queue
→ Approval / Rejection
→ Audit Logging

---

## Setup Instructions

### Backend

```bash
npm install

npx prisma generate

npx prisma migrate deploy

npm start
```

### Frontend

```bash
npm install

npm run dev
```

---

## Environment Variables

### Backend

```env
# ── Server ────────────────────────────────────────────────
NODE_ENV=development
PORT=5000
API_PREFIX=/api/v1

# ── Database (Neon PostgreSQL) ─────────────────────────────
# Pooled connection
DATABASE_URL="db_url"
# Direct connection
DIRECT_URL="db_url"

# ── JWT ───────────────────────────────────────────────────
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_chars
JWT_REFRESH_EXPIRES_IN=30d

# ── Cloudinary ────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=cloudname
CLOUDINARY_API_KEY=1234567890
CLOUDINARY_API_SECRET=apisecret123
CLOUDINARY_UPLOAD_FOLDER=ocr-documents

# ── Google Vision API ─────────────────────────────────────
# Option A: JSON key file path
GOOGLE_APPLICATION_CREDENTIALS=./google-vision-key.json
# Option B: Inline credentials
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GOOGLE_CLOUD_CLIENT_EMAIL=your-service@project.iam.gserviceaccount.com

# ── Rate Limiting ─────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ── File Upload ───────────────────────────────────────────
MAX_FILE_SIZE_MB=10
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,image/tiff,application/pdf

# ── CORS ──────────────────────────────────────────────────
CORS_ORIGIN=http://localhost:5173
```

### Frontend

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

---

## Selected Capabilities

### Offline-First Capture (PWA)

Field operators may operate in areas with unreliable connectivity. Documents are stored locally using IndexedDB and synchronized automatically once connectivity is restored.

### OCR Confidence Scoring

Confidence scores help reviewers quickly identify uncertain OCR results and focus verification efforts where needed.

### Audit Logging

Every modification, approval, and rejection is recorded with complete traceability.

### Asynchronous OCR Processing

Document uploads do not block while OCR processing is running, improving responsiveness and scalability.

### Human-in-the-Loop Verification

OCR assists reviewers but does not replace human validation.

---


## Sample Documents Tested

Testing was performed using a variety of document conditions:

* Clean slips
* Rotated slips
* Low-light images
* Blurry images
* Partial captures
* Glare-affected captures

---

## Assumptions

* Users are provisioned by administrators.
* Documents are primarily weighbridge slips.
* Reviewers perform final validation before approval.
* Approved documents become read-only.
* OCR quality depends on image quality.
* Internet connectivity may be unavailable during field operations.

---

## Known Limitations

* OCR accuracy varies with image quality.
* Offline authentication is not supported for first-time users.
* Initial application load requires connectivity before offline mode becomes available.
* The current implementation relies on third-party OCR services.

---

## Security Considerations

* JWT-based authentication
* Password hashing
* Protected APIs
* Input validation
* File validation
* Audit trail for all review actions

---

## What Breaks at 100x Scale

At significantly higher document volume, OCR processing would become the primary architectural bottleneck because every uploaded document requires external OCR analysis before entering the review workflow.

Search operations, dashboard aggregations, and audit-log queries would also place increased load on the database.

Future scaling strategies:

* OCR job queues
* Dedicated OCR worker services
* Database indexing
* Result caching
* Horizontal API scaling

For the current deployment, the first operational limitations would likely be free-tier service constraints such as:

* Render cold starts
* Google Vision API quotas
* Cloudinary usage limits
* Neon free-tier limits

---

# Sample Documents

These documents were used during development and testing to evaluate OCR extraction, confidence scoring, review workflows, and offline synchronization behavior.

| File               | Scenario         | Expected Result         |
| ------------------ | ---------------- | ----------------------- |
| clean.png     | Clear image      | High OCR confidence 91%    |
| rotated.png   | Rotated document | OCR extraction succeeds (91% confindence) |
| lowLight.png | Poor lighting    | Similar OCR accuracy    |
| glare.png     | Reflection/glare | Partial extraction     |
| partial.png   | Cropped document | Missing fields detected |

## Validation Areas

The sample documents were used to verify:

* OCR extraction
* Confidence scoring
* Review workflows
* Approval workflows
* Audit logging
* Search functionality
* Offline capture and synchronization

## Notes

OCR accuracy depends on image quality and the capabilities of the Google Vision API.


## Future Improvements

* Advanced duplicate detection
* Multi-language OCR
* Real-time notifications
* OCR model benchmarking
* Reviewer assignment workflows
* Analytics and reporting
