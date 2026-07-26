create extension if not exists vector;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  char_count integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "own documents" on public.documents for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;
alter table public.document_chunks enable row level security;
create policy "own chunks" on public.document_chunks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index document_chunks_document_id_idx on public.document_chunks(document_id);
create index document_chunks_user_id_idx on public.document_chunks(user_id);

create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 6
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  filename text,
  similarity float
)
language sql stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.content,
    d.filename,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = auth.uid()
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_chunks(vector, int) to authenticated;