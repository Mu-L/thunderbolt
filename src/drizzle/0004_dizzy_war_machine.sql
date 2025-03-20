-- Custom SQL migration file, put your code below! --

CREATE INDEX IF NOT EXISTS embeddings_test_index ON embeddings (libsql_vector_idx(embedding));