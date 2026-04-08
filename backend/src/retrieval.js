/**
 * RETRIEVAL MODULE (TF-IDF)
 * =========================
 * This module is the "R" in RAG — Retrieval.
 *
 * WHAT TF-IDF IS:
 * ---------------
 * TF-IDF stands for "Term Frequency – Inverse Document Frequency."
 * It's a scoring method from information retrieval (predates LLMs by decades).
 *
 * The intuition:
 *   - A word that appears OFTEN in a chunk is probably important to that chunk (TF)
 *   - BUT a word that appears in EVERY chunk (like "the", "and", "is") is not
 *     useful for distinguishing chunks from each other (IDF penalizes these)
 *
 * The math (simplified):
 *   TF(word, chunk)  = count(word in chunk) / total_words_in_chunk
 *   IDF(word, corpus) = log(total_chunks / chunks_containing_word)
 *   TF-IDF(word, chunk, corpus) = TF × IDF
 *
 * To score a query against a chunk:
 *   - Compute TF-IDF for each query word in the chunk
 *   - Sum the scores
 *   - Higher sum = more relevant chunk
 *
 * WHY NOT EMBEDDINGS?
 * -------------------
 * Embedding-based retrieval (using models like OpenAI's text-embedding-ada-002
 * or Cohere's embed) converts text into dense vectors and uses cosine similarity.
 * It's better at capturing semantic meaning ("car" ≈ "automobile").
 *
 * But for your use case:
 *   - Your corpus is domain-specific (Swiss law, environmental policy)
 *   - Key terms are precise (NHG, Art. 18, GSchG, Verbandsbeschwerderecht)
 *   - TF-IDF handles exact term matching very well for this kind of content
 *   - No external embedding API needed = simpler, faster, free
 *
 * For a CSCW course prototype, TF-IDF is the right tool.
 *
 * WHAT THE `natural` LIBRARY DOES HERE:
 * -------------------------------------
 * The `natural` npm package provides a TfidfDocument class that:
 *   1. Tokenizes text (splits into words)
 *   2. Applies stemming (reduces "protection" and "protecting" to the same root)
 *   3. Computes TF-IDF scores automatically
 *   4. Lets us query with .tfidfs() to rank documents by relevance
 */

import natural from "natural";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TfIdf = natural.TfIdf;

class Retriever {
  constructor() {
    this.tfidf = null; // the TF-IDF index
    this.chunks = []; // the raw chunk objects (id, text, source, chunkIndex)
    this.ready = false;
  }

  /**
   * Load the preprocessed chunks and build the TF-IDF index.
   * Call this once at server startup.
   */
  load() {
    const chunksPath = path.join(__dirname, "..", "data", "chunks.json");

    if (!fs.existsSync(chunksPath)) {
      throw new Error(
        "chunks.json not found. Run 'npm run preprocess' first to build the knowledge base."
      );
    }

    const data = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));
    this.chunks = data.chunks;

    console.log(
      `  Loading ${this.chunks.length} chunks into TF-IDF index...`
    );

    // Build the TF-IDF index
    // Each chunk becomes a "document" in the TF-IDF corpus
    this.tfidf = new TfIdf();

    for (const chunk of this.chunks) {
      // addDocument tokenizes the text, stems words, and records term frequencies
      this.tfidf.addDocument(chunk.text);
    }

    this.ready = true;
    console.log(`  TF-IDF index built. Ready for queries.\n`);
  }

  /**
   * Retrieve the top-k most relevant chunks for a given query.
   *
   * How it works:
   *   1. The query is tokenized and stemmed the same way the chunks were
   *   2. For each chunk, TF-IDF computes a relevance score
   *   3. We sort by score descending and return the top k
   *
   * @param {string} query - The user's question
   * @param {number} topK - How many chunks to retrieve (default: 5)
   * @returns {Array<{id: string, text: string, source: string, score: number}>}
   */
  retrieve(query, topK = 5) {
    if (!this.ready) {
      throw new Error("Retriever not initialized. Call load() first.");
    }

    // Score every chunk against the query
    const scores = [];

    this.tfidf.tfidfs(query, (chunkIndex, score) => {
      scores.push({
        ...this.chunks[chunkIndex],
        score: score,
      });
    });

    // Sort by score descending (highest relevance first)
    scores.sort((a, b) => b.score - a.score);

    // Filter out chunks with zero relevance (no term overlap at all)
    const relevant = scores.filter((s) => s.score > 0);

    // Return top k
    const results = relevant.slice(0, topK);

    return results;
  }

  /**
   * Get statistics about the loaded knowledge base.
   * Useful for the frontend to display corpus info.
   */
  getStats() {
    if (!this.ready) return null;

    const sources = [...new Set(this.chunks.map((c) => c.source))];
    return {
      totalChunks: this.chunks.length,
      totalDocuments: sources.length,
      documents: sources,
    };
  }
}

// Export a singleton instance
// This means the whole server shares one TF-IDF index in memory
const retriever = new Retriever();
export default retriever;
