# 🧠 AI Screening Backend

This project is a backend system designed to automatically evaluate a candidate's **CV** and **Project Report** using AI (RAG + LLM chaining).  
It follows a modular and containerized architecture for easy setup, reproducibility, and deployment.  
---

## 🧩 Overview

The system consists of the following services:

| Service | Description |
|----------|--------------|
| **Express API** | Main HTTP API server — handles file uploads, ingestion, and evaluation job creation. |
| **Redis** | Used for BullMQ job queue and storing job status. |
| **BullMQ Worker** | Background worker that processes evaluations (parse → retrieve → evaluate → summarize). |
| **Chroma** | Vector database for storing and retrieving ground truth context documents. |
| **MinIO** | S3-compatible storage for CVs and project PDFs (mocked cloud storage). |

All services run together using **Docker Compose** for easy portability.

---

## 🚀 Quick Start

### **1. Clone the repository**
```bash
git clone https://github.com/<your-username>/ai-screening-backend.git
cd ai-screening-backend
````

### **2. Run all services**

```bash
docker compose up --build
```

This command will start:

* Express API (on port 3000)
* Redis
* BullMQ Worker
* MinIO (port 9000)
* Chroma (port 8000)
---

## 📡 API Endpoints

| Method   | Endpoint         | Description                                                              |
| -------- | ---------------- | ------------------------------------------------------------------------ |
| **POST** | `/ingest`        | Upload ground truth (e.g., job descriptions, rubrics) as JSON to Chroma. |
| **POST** | `/ingest/context`| Get context from Chroma based on the query on JSON body. |
| **POST** | `/upload`        | Upload candidate CV and project report PDFs.                             |
| **POST** | `/evaluate`      | Trigger asynchronous evaluation job.                                     |
| **GET**  | `/result/:jobId` | Retrieve job progress and final scores.                                  |

---
## 🧪 Testing

A **Postman collection** is attached with this project for easy testing of each endpoint.
You can import it directly into Postman and follow the order:

1. `POST /ingest` – upload ground truth JSON
2. `POST /upload` – upload CV & project PDFs
3. `POST /evaluate` – trigger evaluation
4. `GET /result/:jobId` – check final result

---

## ⚙️ Notes

* The whole system is self-contained in Docker — no local installation needed.
* MinIO’s free tier has upload limits, so ground truth data is injected via JSON for stability.
* The AI model provider can be changed easily in `llmService.js` (currently uses **Mistral AI**).

---

## 🧾 License

This project is for **AI Screening Case Study** purposes only.

---
