## What you'll get

- Sign-up / login (email + password + Google) — every user has their own private document library
- **Documents** page: upload PDF, DOCX, TXT, or MD; text is extracted, chunked, embedded, and stored
- **Chat** page: the existing UI, but the "Ask" button now runs a built-in agentic loop over *your* documents (retrieve → grade → rewrite-if-needed → generate → verify)
- The external Backend URL field stays as an alternative — leave it blank to use the built-in backend, or fill it in to keep using your FastAPI server

## How it works (technical)

- **Cloud + auth**: enable Lovable Cloud; email/password + Google sign-in; protected routes under `_authenticated/`
- **Storage**:
  - `documents` table: `id, user_id, filename, mime_type, char_count, created_at` (RLS: owner-only)
  - `document_chunks` table: `id, document_id, user_id, content, embedding vector(1536), chunk_index` with HNSW cosine index; RLS: owner-only
  - `match_chunks(user_id, query_embedding, match_count)` SQL function scoped to caller
- **Ingestion** (client-side text extraction to stay inside Worker limits):
  - PDF → `pdfjs-dist` in the browser
  - DOCX → `mammoth` in the browser
  - TXT/MD → read directly
  - Chunk to ~1000 chars w/ 150 overlap → POST to `ingestDocument` server fn → embed via Lovable AI Gateway (`openai/text-embedding-3-small`, 1536 dims) → insert rows
- **Chat server fn `/api/chat`** (agentic loop, max 2 rewrite iterations):
  1. embed query → top-k retrieve from *user's* chunks only
  2. **Grade** each chunk relevance with `google/gemini-2.5-flash` structured output (yes/no)
  3. If ≥1 relevant OR loop_step == 2 → **Generate** grounded answer with `google/gemini-2.5-flash`
  4. **Verify** answer is grounded in the kept context; if not, **Rewrite** the query and loop
  5. Return `{ answer, sources, final_query }` — same shape the current UI already expects
- **UI**:
  - New `/auth` page (login/signup + Google button)
  - New `/documents` page (upload, list, delete) under `_authenticated/`
  - Chat becomes `_authenticated/` too; header gets user menu + sign out + link to Documents
  - "Backend" field: if empty, calls the built-in server fn; if set, POSTs to your external URL (existing behavior)

## Out of scope for this change

- OCR of scanned/image-only PDFs (text-layer PDFs only)
- Sharing documents between users
- Streaming token-by-token responses (answer arrives when the loop finishes)

Reply "go" (or with tweaks) and I'll build it.