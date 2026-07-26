import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IngestSchema = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(200),
  text: z.string().min(1).max(2_000_000),
});

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IngestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { embed, chunkText } = await import("./ai.server");
    const chunks = chunkText(data.text);
    if (chunks.length === 0) throw new Error("No extractable text");

    const { data: doc, error: docErr } = await context.supabase
      .from("documents")
      .insert({
        user_id: context.userId,
        filename: data.filename,
        mime_type: data.mime_type,
        char_count: data.text.length,
      })
      .select("id")
      .single();
    if (docErr || !doc) throw new Error(docErr?.message ?? "Insert failed");

    // Embed in batches to stay within request limits.
    const BATCH = 64;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vectors = await embed(batch);
      const rows = batch.map((content, j) => ({
        document_id: doc.id,
        user_id: context.userId,
        chunk_index: i + j,
        content,
        embedding: vectors[j] as unknown as string,
      }));
      const { error: chunkErr } = await context.supabase.from("document_chunks").insert(rows);
      if (chunkErr) {
        await context.supabase.from("documents").delete().eq("id", doc.id);
        throw new Error(chunkErr.message);
      }
    }

    return { id: doc.id, chunks: chunks.length };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("id, filename, mime_type, char_count, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const QuerySchema = z.object({ query: z.string().min(1).max(2000) });

type ChunkHit = {
  id: string;
  document_id: string;
  content: string;
  filename: string;
  similarity: number;
};

export const queryDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => QuerySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { embed, chat } = await import("./ai.server");

    let currentQuery = data.query.trim();
    let relevant: ChunkHit[] = [];
    let generation = "";
    let finalQuery = currentQuery;
    const MAX_LOOPS = 2;

    for (let step = 0; step <= MAX_LOOPS; step++) {
      finalQuery = currentQuery;
      // 1. Retrieve
      const [queryVec] = await embed(currentQuery);
      const { data: hits, error } = await context.supabase.rpc("match_chunks", {
        query_embedding: queryVec as unknown as string,
        match_count: 6,
      });
      if (error) throw new Error(error.message);
      const retrieved = (hits ?? []) as ChunkHit[];

      // 2. Grade
      relevant = [];
      if (retrieved.length > 0) {
        const graded = await Promise.all(
          retrieved.map(async (h) => {
            const verdict = await chat({
              responseJson: true,
              messages: [
                {
                  role: "system",
                  content:
                    'You grade whether a document snippet is relevant to a question. Respond with strict JSON: {"binary_score":"yes"} or {"binary_score":"no"}.',
                },
                {
                  role: "user",
                  content: `Question: ${currentQuery}\n\nSnippet:\n${h.content}`,
                },
              ],
            });
            try {
              const parsed = JSON.parse(verdict) as { binary_score?: string };
              return parsed.binary_score === "yes" ? h : null;
            } catch {
              return null;
            }
          }),
        );
        relevant = graded.filter((x): x is ChunkHit => x !== null);
      }

      // 3. Decide
      if (relevant.length === 0 && step < MAX_LOOPS) {
        // Transform query and retry
        currentQuery = await chat({
          messages: [
            {
              role: "system",
              content:
                "Rewrite the user's question to improve document retrieval. Return only the rewritten question, no preamble.",
            },
            { role: "user", content: currentQuery },
          ],
        });
        currentQuery = currentQuery.trim().replace(/^["']|["']$/g, "");
        continue;
      }

      // 4. Generate
      if (relevant.length === 0) {
        generation =
          "I couldn't find anything relevant to your question in your uploaded documents.";
        break;
      }
      const context_text = relevant
        .map((r, i) => `[${i + 1}] (${r.filename})\n${r.content}`)
        .join("\n\n---\n\n");
      generation = await chat({
        messages: [
          {
            role: "system",
            content:
              "You are a careful research assistant. Answer the question using ONLY the provided context. If the context does not contain the answer, say so. Cite sources inline as [1], [2], etc.",
          },
          {
            role: "user",
            content: `Context:\n${context_text}\n\nQuestion: ${currentQuery}`,
          },
        ],
      });

      // 5. Verify grounding
      const verify = await chat({
        responseJson: true,
        messages: [
          {
            role: "system",
            content:
              'Decide if the ANSWER is grounded in / supported by the CONTEXT. Respond strict JSON: {"binary_score":"yes"} or {"binary_score":"no"}.',
          },
          {
            role: "user",
            content: `Context:\n${context_text}\n\nAnswer:\n${generation}`,
          },
        ],
      });
      let grounded = true;
      try {
        grounded = (JSON.parse(verify) as { binary_score?: string }).binary_score === "yes";
      } catch {
        grounded = true;
      }
      if (grounded || step >= MAX_LOOPS) break;

      // Rewrite and loop
      currentQuery = await chat({
        messages: [
          {
            role: "system",
            content:
              "The previous answer was not grounded in the sources. Rewrite the user's question to improve document retrieval. Return only the rewritten question.",
          },
          { role: "user", content: currentQuery },
        ],
      });
      currentQuery = currentQuery.trim().replace(/^["']|["']$/g, "");
    }

    return {
      answer: generation,
      sources: relevant.map((r) => `${r.filename}: ${r.content.slice(0, 240)}${r.content.length > 240 ? "…" : ""}`),
      final_query: finalQuery,
    };
  });