/**
 * KNOWLEDGE BASE DIAGNOSTIC
 * =========================
 * Run this AFTER preprocessing to verify everything works.
 *
 * It checks:
 *   1. Are the chunks well-formed? (no empty chunks, reasonable sizes)
 *   2. Does retrieval return sensible results for test queries?
 *   3. Which documents are most/least represented in the corpus?
 *
 * This is a development tool — it helps you catch problems before
 * they show up as bad answers in the demo.
 *
 * RUN WITH: node scripts/diagnose.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import natural from "natural";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNKS_PATH = path.join(__dirname, "..", "data", "chunks.json");

// Test queries that should hit specific documents
// Adjust these based on what's actually in YOUR corpus
const TEST_QUERIES = [
  {
    query: "NHG Art. 18 habitat protection biodiversity",
    expectSource: null, // set to a filename if you know which PDF should match
    description: "Should retrieve chunks about Swiss nature protection law",
  },
  {
    query: "Verbandsbeschwerderecht right of appeal Pro Natura",
    expectSource: null,
    description: "Should retrieve chunks about Pro Natura's legal instruments",
  },
  {
    query: "Gewässerschutz lake water protection Zürichsee",
    expectSource: null,
    description: "Should retrieve chunks about water protection regulations",
  },
  {
    query: "bridge infrastructure economic benefits commute",
    expectSource: null,
    description: "Should retrieve chunks about economic arguments",
  },
  {
    query: "Umweltverträglichkeitsprüfung UVP environmental impact assessment",
    expectSource: null,
    description: "Should retrieve chunks about environmental impact assessments",
  },
  {
    query: "Raumplanung spatial planning zoning RPG",
    expectSource: null,
    description: "Should retrieve chunks about spatial planning law",
  },
];

function main() {
  console.log("=== Knowledge Base Diagnostic ===\n");

  // ── Load chunks ──────────────────────────────────────────────────────
  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error("✗ chunks.json not found. Run 'npm run preprocess' first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf-8"));
  const { metadata, chunks } = data;

  console.log("1. CORPUS OVERVIEW");
  console.log("─".repeat(50));
  console.log(`   Files processed:  ${metadata.totalFiles}`);
  console.log(`   Total chunks:     ${metadata.totalChunks}`);
  console.log(`   Total characters: ${metadata.totalChars.toLocaleString()}`);
  console.log(`   Est. tokens:      ~${metadata.estimatedTokens.toLocaleString()}`);
  console.log(`   Created at:       ${metadata.createdAt}`);

  // ── Chunk size distribution ──────────────────────────────────────────
  console.log("\n2. CHUNK SIZE DISTRIBUTION");
  console.log("─".repeat(50));

  const sizes = chunks.map((c) => c.text.length);
  let minSize = Infinity;
  let maxSize = 0;
  let totalSize = 0;
  for (const s of sizes) {
    if (s < minSize) minSize = s;
    if (s > maxSize) maxSize = s;
    totalSize += s;
  }
  const avgSize = Math.round(totalSize / sizes.length);

  console.log(`   Min:     ${minSize} chars (~${Math.round(minSize / 4)} tokens)`);
  console.log(`   Max:     ${maxSize} chars (~${Math.round(maxSize / 4)} tokens)`);
  console.log(`   Average: ${avgSize} chars (~${Math.round(avgSize / 4)} tokens)`);

  // Histogram buckets
  const buckets = { "0-500": 0, "500-1000": 0, "1000-2000": 0, "2000-3000": 0, "3000+": 0 };
  for (const s of sizes) {
    if (s < 500) buckets["0-500"]++;
    else if (s < 1000) buckets["500-1000"]++;
    else if (s < 2000) buckets["1000-2000"]++;
    else if (s < 3000) buckets["2000-3000"]++;
    else buckets["3000+"]++;
  }
  console.log("\n   Size distribution:");
  for (const [range, count] of Object.entries(buckets)) {
    const bar = "█".repeat(Math.round((count / chunks.length) * 40));
    console.log(`   ${range.padEnd(10)} ${bar} ${count}`);
  }

  // ── Documents breakdown ──────────────────────────────────────────────
  console.log("\n3. DOCUMENTS BREAKDOWN");
  console.log("─".repeat(50));

  const docCounts = {};
  for (const c of chunks) {
    docCounts[c.source] = (docCounts[c.source] || 0) + 1;
  }

  const sorted = Object.entries(docCounts).sort((a, b) => b[1] - a[1]);
  for (const [doc, count] of sorted) {
    const pct = ((count / chunks.length) * 100).toFixed(1);
    console.log(`   ${count.toString().padStart(4)} chunks (${pct.padStart(5)}%) — ${doc}`);
  }

  // Flag potential issues
  const lowChunkDocs = sorted.filter(([, count]) => count <= 1);
  if (lowChunkDocs.length > 0) {
    console.log(`\n   ⚠ ${lowChunkDocs.length} document(s) have only 1 chunk — they may be too short or poorly extracted:`);
    for (const [doc] of lowChunkDocs) {
      console.log(`     → ${doc}`);
    }
  }

  // ── Sample chunks (show first and last for inspection) ───────────────
  console.log("\n4. SAMPLE CHUNKS (first 200 chars of first 3 chunks)");
  console.log("─".repeat(50));

  for (const chunk of chunks.slice(0, 3)) {
    console.log(`\n   [${chunk.id}] from ${chunk.source}:`);
    console.log(`   "${chunk.text.slice(0, 200).replace(/\n/g, " ")}..."`);
  }

  // ── Test TF-IDF retrieval ────────────────────────────────────────────
  console.log("\n5. RETRIEVAL TEST");
  console.log("─".repeat(50));

  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  for (const chunk of chunks) {
    tfidf.addDocument(chunk.text);
  }

  for (const test of TEST_QUERIES) {
    console.log(`\n   Query: "${test.query}"`);
    console.log(`   Expected: ${test.description}`);

    const scores = [];
    tfidf.tfidfs(test.query, (i, score) => {
      scores.push({ chunk: chunks[i], score });
    });
    scores.sort((a, b) => b.score - a.score);

    const top3 = scores.filter((s) => s.score > 0).slice(0, 3);

    if (top3.length === 0) {
      console.log("   ✗ NO RESULTS — no chunks matched this query at all!");
      console.log("     This means your corpus may not contain content about this topic.");
    } else {
      for (const r of top3) {
        const preview = r.chunk.text.slice(0, 100).replace(/\n/g, " ");
        console.log(
          `   → [${r.score.toFixed(2)}] ${r.chunk.source} — "${preview}..."`
        );
      }

      if (test.expectSource && !top3.some((r) => r.chunk.source.includes(test.expectSource))) {
        console.log(`   ⚠ Expected source "${test.expectSource}" not in top 3 results`);
      }
    }
  }

  // ── Overall assessment ───────────────────────────────────────────────
  console.log("\n6. ASSESSMENT");
  console.log("─".repeat(50));

  const issues = [];

  if (chunks.length < 20) {
    issues.push("Very few chunks — your corpus may be too small for effective retrieval");
  }
  if (avgSize < 200) {
    issues.push("Chunks are very small — consider increasing CHUNK_SIZE in preprocess.js");
  }
  if (avgSize > 4000) {
    issues.push("Chunks are very large — consider decreasing CHUNK_SIZE for more precise retrieval");
  }
  if (sorted.length < 3) {
    issues.push("Very few source documents — more diverse sources would improve retrieval");
  }

  if (issues.length === 0) {
    console.log("   ✓ No major issues detected. Knowledge base looks ready.");
  } else {
    for (const issue of issues) {
      console.log(`   ⚠ ${issue}`);
    }
  }

  console.log("\nDone.\n");
}

main();
