/**
 * DOCUMENT PREPROCESSOR
 * ====================
 * This script runs ONCE to build your knowledge base.
 * It does three things:
 *   1. Reads every PDF in the data/pdfs/ directory
 *   2. Extracts the text content
 *   3. Splits it into overlapping chunks of ~500-800 tokens
 *   4. Saves everything as a single JSON file (data/chunks.json)
 *
 * WHY CHUNKING?
 * -------------
 * When a user asks "What does NHG Art. 18 say about habitat protection?",
 * we don't want to send ALL 20 documents to the LLM. We want to find the
 * 3-5 most relevant PASSAGES and send only those. Smaller chunks = more
 * precise retrieval.
 *
 * WHY OVERLAPPING?
 * ----------------
 * If we split text at exactly every 600 tokens, we might cut a sentence
 * or argument in half. By overlapping chunks (each chunk shares ~100 tokens
 * with the previous one), we reduce the chance of losing context at boundaries.
 *
 * RUN WITH: npm run preprocess
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";

// __dirname doesn't exist in ES modules, so we reconstruct it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CONFIGURATION ──────────────────────────────────────────────────────
const PDF_DIR = path.join(__dirname, "..", "data", "pdfs");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "chunks.json");

// Chunk size in characters (not tokens — roughly 4 chars ≈ 1 token for English/German)
// 2400 chars ≈ 600 tokens, which is our target chunk size
const CHUNK_SIZE = 2400;

// Overlap in characters — how much the end of one chunk overlaps with the start of the next
// 400 chars ≈ 100 tokens of overlap
const CHUNK_OVERLAP = 400;

// ── HELPER: SPLIT TEXT INTO OVERLAPPING CHUNKS ─────────────────────────
/**
 * Splits a long text into overlapping chunks.
 *
 * The algorithm:
 *   1. Start at position 0
 *   2. Take CHUNK_SIZE characters
 *   3. Find the last sentence boundary (., !, ?, or newline) within that window
 *      so we don't cut mid-sentence
 *   4. Record that chunk
 *   5. Move forward by (chunk_end - CHUNK_OVERLAP) so the next chunk overlaps
 *   6. Repeat until we've covered the whole text
 *
 * @param {string} text - The full extracted text of a document
 * @param {string} source - The filename, for metadata
 * @returns {Array<{text: string, source: string, chunkIndex: number}>}
 */
function chunkText(text, source) {
  const chunks = [];

  // Clean up the text: normalize whitespace, remove excessive blank lines
  const cleaned = text
    .replace(/\r\n/g, "\n")       // normalize line endings
    .replace(/\n{3,}/g, "\n\n")   // collapse triple+ newlines to double
    .replace(/[ \t]+/g, " ")      // collapse multiple spaces/tabs to single space
    .trim();

  if (cleaned.length === 0) return chunks;

  let position = 0;
  let chunkIndex = 0;

  while (position < cleaned.length) {
    // Take a window of CHUNK_SIZE characters
    let end = Math.min(position + CHUNK_SIZE, cleaned.length);

    // If we're not at the end of the document, try to break at a sentence boundary
    if (end < cleaned.length) {
      // Look backwards from 'end' to find the last sentence-ending punctuation
      // We search within the last 30% of the chunk to avoid making chunks too small
      const searchStart = position + Math.floor(CHUNK_SIZE * 0.7);
      const searchWindow = cleaned.slice(searchStart, end);

      // Find the last period, question mark, exclamation mark, or double newline
      const lastBreak = Math.max(
        searchWindow.lastIndexOf(". "),
        searchWindow.lastIndexOf(".\n"),
        searchWindow.lastIndexOf("? "),
        searchWindow.lastIndexOf("! "),
        searchWindow.lastIndexOf("\n\n")
      );

      if (lastBreak !== -1) {
        // +1 to include the punctuation, +searchStart to get absolute position
        end = searchStart + lastBreak + 1;
      }
    }

    const chunkText = cleaned.slice(position, end).trim();

    if (chunkText.length > 50) {
      // Only keep chunks with meaningful content (skip tiny fragments)
      chunks.push({
        text: chunkText,
        source: source,
        chunkIndex: chunkIndex,
      });
      chunkIndex++;
    }

    // Move forward, but overlap with the previous chunk
    const newPosition = end - CHUNK_OVERLAP;

    // Safety: ensure we always advance by at least 200 chars to avoid infinite loops
    if (newPosition <= position) {
      position = end;
    } else {
      position = newPosition;
    }
  }

  return chunks;
}

// ── MAIN FUNCTION ──────────────────────────────────────────────────────
async function main() {
  console.log("=== Document Preprocessor ===\n");

  // Check if PDF directory exists
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`PDF directory not found: ${PDF_DIR}`);
    console.error("Create it and place your PDFs there, then run again.");
    process.exit(1);
  }

  // Find all PDF files
  const pdfFiles = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) {
    console.error("No PDF files found in", PDF_DIR);
    process.exit(1);
  }

  console.log(`Found ${pdfFiles.length} PDFs:\n`);

  const allChunks = [];
  const stats = {
    totalFiles: pdfFiles.length,
    totalChunks: 0,
    totalChars: 0,
    filesProcessed: [],
  };

  // Process each PDF
  for (const filename of pdfFiles) {
    const filepath = path.join(PDF_DIR, filename);
    console.log(`  Processing: ${filename}`);

    try {
      // Read the PDF file into a buffer
      const buffer = fs.readFileSync(filepath);

      // Extract text using pdf-parse
      const data = await pdfParse(buffer);

      // data.text contains the full extracted text
      const text = data.text;
      const charCount = text.length;
      const pageCount = data.numpages;

      console.log(`    → ${pageCount} pages, ${charCount} chars`);

      // Chunk the extracted text
      const chunks = chunkText(text, filename);
      console.log(`    → ${chunks.length} chunks created`);

      allChunks.push(...chunks);

      stats.totalChunks += chunks.length;
      stats.totalChars += charCount;
      stats.filesProcessed.push({
        filename,
        pages: pageCount,
        chars: charCount,
        chunks: chunks.length,
      });
    } catch (err) {
      console.error(`    ✗ Error processing ${filename}:`, err.message);
    }
  }

  // Assign a global unique ID to each chunk
  // This ID will be used to reference specific chunks in the retrieval step
  const indexedChunks = allChunks.map((chunk, i) => ({
    id: `chunk_${String(i).padStart(4, "0")}`,
    ...chunk,
  }));

  // Save to JSON
  const output = {
    metadata: {
      createdAt: new Date().toISOString(),
      ...stats,
      estimatedTokens: Math.round(stats.totalChars / 4), // rough estimate
    },
    chunks: indexedChunks,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  // Print summary
  console.log("\n=== Summary ===");
  console.log(`  Files processed: ${stats.totalFiles}`);
  console.log(`  Total chunks:    ${stats.totalChunks}`);
  console.log(`  Total chars:     ${stats.totalChars.toLocaleString()}`);
  console.log(`  Est. tokens:     ~${Math.round(stats.totalChars / 4).toLocaleString()}`);
  console.log(`\n  Output: ${OUTPUT_FILE}`);
  console.log("\nDone. You can now start the server with: npm start\n");
}

main().catch(console.error);
