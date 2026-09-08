# KingStar API Contracts (BFF)

Base URL (dev): `http://127.0.0.1:8080`

All web traffic goes through `services/api`. Do not call MinerU or DeepSeek from the browser.

## Shared types

See `packages/shared` — task statuses and accepted upload formats.

### TaskStatus

`queued` | `parsing` | `translating` | `done` | `failed`

### Supported upload formats

`.pdf`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.ppt`, `.pptx`, `.doc`, `.docx`, `.txt`, `.md`

---

## `POST /api/v1/uploads`

Upload a document file (store only — does not start parse/translate).

**Request:** `multipart/form-data` with field `file`

**Response:**
```json
{
  "upload_id": "uuid",
  "filename": "paper.pdf",
  "size": 123456,
  "content_type": "application/pdf",
  "created_at": "2026-08-03T12:00:00Z"
}
```

---

## `GET /api/v1/uploads`

List uploaded files for the sidebar.

**Response:**
```json
{
  "items": [
    {
      "upload_id": "uuid",
      "filename": "paper.pdf",
      "size": 123456,
      "content_type": "application/pdf",
      "created_at": "...",
      "last_task_id": null,
      "last_status": null
    }
  ]
}
```

---

## `DELETE /api/v1/uploads/{upload_id}`

Delete an uploaded file from storage.

**Response:** `{ "ok": true, "upload_id": "uuid" }`

---

## `POST /api/v1/tasks`


Create a processing job.

**Request:**
```json
{
  "upload_id": "uuid",
  "translate": false,
  "beautify": false,
  "parse_backend": "hybrid-engine"
}
```

- `translate`: after parse, run EN→ZH (+ PDF) when markdown is English academic content
- `beautify`: use Translation beautify path when translating

**Response:**
```json
{
  "task_id": "uuid",
  "status": "queued"
}
```

---

## `GET /api/v1/tasks`

List recent tasks (task management sidebar).

**Response:**
```json
{
  "items": [
    {
      "task_id": "uuid",
      "filename": "paper.pdf",
      "status": "done",
      "created_at": "2026-08-03T12:00:00Z",
      "updated_at": "2026-08-03T12:05:00Z",
      "error": null
    }
  ]
}
```

---

## `GET /api/v1/tasks/{task_id}`

**Response:**
```json
{
  "task_id": "uuid",
  "filename": "paper.pdf",
  "status": "done",
  "created_at": "...",
  "updated_at": "...",
  "error": null,
  "result": {
    "markdown_url": "/api/v1/tasks/{id}/artifacts/markdown",
    "zh_markdown_url": "/api/v1/tasks/{id}/artifacts/zh_markdown",
    "pdf_url": "/api/v1/tasks/{id}/artifacts/pdf",
    "meta": {
      "backend": "hybrid-engine",
      "pages": 12,
      "source": "mineru"
    }
  }
}
```

While running, `result` may be `null` and `status` is `parsing` or `translating`.

---

## `GET /api/v1/tasks/{task_id}/artifacts/{name}`

Download artifact. `name`: `markdown` | `zh_markdown` | `pdf` | `middle_json` | `content_list`

---

## `GET /api/v1/health`

```json
{
  "ok": true,
  "mineru": "up|down|unknown",
  "translate": "ready"
}
```

---

## Internal (not for browser)

- Parse adapter → MinerU `POST /tasks` or `POST /file_parse`, then normalize to product `ParseResult`
- Translate package → `translate_markdown` / `export_pdf` / `beautify_and_export`
