# Semantic Vector Features - Overview

This document outlines a comprehensive plan to leverage SurrealDB's vector capabilities for enhanced knowledge graph features in My Slow News.

## Background

SurrealDB supports vector data types and similarity search operations (cosine, euclidean, etc.). By storing embeddings alongside our existing data, we can enable semantic understanding that goes beyond keyword matching.

## Feature Roadmap

| # | Feature | Priority | Complexity | Dependencies |
|---|---------|----------|------------|--------------|
| 1 | Semantic Claim Deduplication | High | Medium | Embedding infrastructure |
| 2 | Natural Language Claim Search | High | Low | Feature 1 |
| 3 | Related Claims Discovery | Medium | Low | Feature 1 |
| 4 | Contradiction Detection | Medium | Medium | Feature 1 |
| 5 | Theme Clustering | Medium | High | Feature 1 |
| 6 | Personalized Recommendations | Low | Medium | Features 1, 3 |
| 7 | Cross-Subreddit Bridging | Low | Medium | Feature 5 |
| 8 | Temporal Semantic Analysis | Low | High | Features 1, 5 |

---

## Feature Summaries

### Feature 1: Semantic Claim Deduplication

**Problem:** The same claim can be expressed in many ways:
- "Rust is safer than C++"
- "C++ has more memory bugs than Rust"
- "Rust prevents memory safety issues that plague C++"

Currently, these are stored as separate claims, bloating the knowledge base.

**Solution:**
- Embed each claim as a vector
- Before inserting new claims, check similarity against existing claims
- If similarity exceeds threshold, link claims together instead of duplicating
- Merge stance data for semantically equivalent claims

**Value:** Cleaner knowledge base, consolidated stance tracking, better analytics.

---

### Feature 2: Natural Language Claim Search

**Problem:** Current search requires exact or partial text matching. Users can't ask conceptual questions like "what do people think about memory safety?"

**Solution:**
- Embed user search queries
- Perform vector similarity search against claim embeddings
- Rank results by semantic relevance
- Integrate into CLI explorer

**Value:** More intuitive discovery, finds relevant claims regardless of phrasing.

---

### Feature 3: Related Claims Discovery

**Problem:** When viewing a claim, users have no way to find related claims unless they share exact keywords.

**Solution:**
- For any claim, query top-N similar claims by embedding distance
- Filter out exact duplicates (handled by Feature 1)
- Display in claim detail view
- Optionally group by predicate or subject

**Value:** Serendipitous discovery, knowledge graph exploration, context building.

---

### Feature 4: Contradiction Detection

**Problem:** The knowledge base may contain contradicting claims without any indication of conflict.

**Solution:**
- Find claim pairs with high semantic similarity (>0.8)
- Check for opposing signals:
  - Opposite predicates (supports vs opposes)
  - Opposite stances on similar claims
  - Semantic opposition detection via LLM
- Flag contradictions in the database
- Surface in explorer with "Contradictions" view

**Value:** Critical thinking aid, debate preparation, identifying contested topics.

---

### Feature 5: Theme Clustering

**Problem:** Hard to see "big picture" patterns across many claims and posts.

**Solution:**
- Periodically run clustering algorithm on claim embeddings
- Use k-means, DBSCAN, or hierarchical clustering
- Auto-generate cluster labels via LLM
- Store cluster assignments in database
- Add "Themes" view to explorer

**Value:** Emerging topic detection, digest organization, trend analysis.

---

### Feature 6: Personalized Recommendations

**Problem:** All users see the same content regardless of their interests.

**Solution:**
- Build user interest vector from claims they've stanced on
- Weight by recency and stance strength
- Find claims similar to user's interest vector
- Exclude already-seen claims
- Add "Recommended for you" section

**Value:** Relevant content surfacing, engagement, personalized digests.

---

### Feature 7: Cross-Subreddit Bridging

**Problem:** Related discussions in different subreddits are invisible to each other.

**Solution:**
- Compare post/claim embeddings across subreddits
- Find high-similarity pairs from different sources
- Surface as "Related discussions in r/X"
- Highlight in digests when themes span communities

**Value:** Cross-pollination of ideas, broader perspective, community bridging.

---

### Feature 8: Temporal Semantic Analysis

**Problem:** No way to track how topics and sentiment evolve over time.

**Solution:**
- Store embeddings with timestamps
- Track cluster/theme evolution over time
- Compute semantic drift metrics
- Detect narrative emergence and shift
- Add "Timeline" visualization

**Value:** Trend analysis, narrative tracking, historical context.

---

## Technical Architecture

### Embedding Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│                    Embedding Service                        │
├─────────────────────────────────────────────────────────────┤
│  src/embeddings/                                            │
│  ├── index.ts          # Main embedding interface           │
│  ├── providers/                                             │
│  │   ├── openai.ts     # OpenAI text-embedding-3-small     │
│  │   ├── anthropic.ts  # Future: Anthropic embeddings      │
│  │   └── ollama.ts     # Local embeddings via Ollama       │
│  ├── cache.ts          # Embedding cache to reduce costs   │
│  └── batch.ts          # Batch embedding operations        │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Additions

```sql
-- Add embedding field to claims
DEFINE FIELD embedding ON claim TYPE option<array<float>>;
DEFINE FIELD embedding_model ON claim TYPE option<string>;
DEFINE FIELD embedded_at ON claim TYPE option<datetime>;

-- Vector index for similarity search
-- Note: Verify syntax against your SurrealDB version (1.x vs 2.x)
-- SurrealDB 2.x syntax:
DEFINE INDEX idx_claim_embedding ON claim FIELDS embedding
  VECTOR MTREE DIMENSION 1536 DIST COSINE TYPE F32;
-- SurrealDB 1.x may use different syntax - check docs

-- Claim similarity links (for deduplication)
DEFINE TABLE claim_similarity TYPE RELATION
  FROM claim TO claim SCHEMAFULL;
DEFINE FIELD similarity ON claim_similarity TYPE float;
DEFINE FIELD relationship ON claim_similarity TYPE string;
  -- 'duplicate', 'related', 'contradicts'
DEFINE FIELD detected_at ON claim_similarity TYPE datetime;

-- Theme/cluster storage
DEFINE TABLE theme SCHEMAFULL;
DEFINE FIELD name ON theme TYPE string;
DEFINE FIELD description ON theme TYPE option<string>;
DEFINE FIELD centroid ON theme TYPE array<float>;
DEFINE FIELD created_at ON theme TYPE datetime;
DEFINE FIELD updated_at ON theme TYPE datetime;

-- Claim to theme membership
DEFINE TABLE claim_theme TYPE RELATION FROM claim TO theme SCHEMAFULL;
DEFINE FIELD membership_score ON claim_theme TYPE float;
DEFINE FIELD assigned_at ON claim_theme TYPE datetime;

-- Post embeddings for cross-subreddit bridging
DEFINE FIELD embedding ON post TYPE option<array<float>>;
DEFINE FIELD embedding_model ON post TYPE option<string>;
DEFINE INDEX idx_post_embedding ON post FIELDS embedding
  VECTOR MTREE DIMENSION 1536 DIST COSINE TYPE F32;
```

### Configuration Additions

```yaml
# config.yaml additions
embeddings:
  provider: openai  # openai | anthropic | ollama
  model: text-embedding-3-small
  dimensions: 1536
  cache_enabled: true
  batch_size: 100

  # Provider-specific settings
  openai:
    api_key_env: OPENAI_API_KEY
  ollama:
    base_url: http://localhost:11434
    model: nomic-embed-text

semantic:
  deduplication:
    enabled: true
    similarity_threshold: 0.92  # Cosine similarity for duplicates
    related_threshold: 0.75     # Threshold for "related" claims

  search:
    enabled: true
    max_results: 20
    min_similarity: 0.5

  clustering:
    enabled: true
    algorithm: kmeans  # kmeans | dbscan | hierarchical
    min_cluster_size: 5
    recompute_interval_hours: 24

  contradictions:
    enabled: true
    similarity_threshold: 0.8
    use_llm_verification: true
```

### Environment Variables

```bash
# .env additions
OPENAI_API_KEY=sk-...  # For OpenAI embeddings
# OR
OLLAMA_BASE_URL=http://localhost:11434  # For local embeddings
```

---

## Implementation Order

### Phase 1: Foundation (Feature 1)
1. Set up embedding infrastructure
2. Add embedding fields to schema
3. Implement claim deduplication
4. Backfill existing claims with embeddings
5. Add CLI commands for testing

### Phase 2: Search & Discovery (Features 2-3)
1. Implement semantic search
2. Add to CLI explorer
3. Implement related claims
4. Update claim detail view

### Phase 3: Intelligence (Features 4-5)
1. Implement contradiction detection
2. Add contradiction indicators to UI
3. Implement theme clustering
4. Add themes view to explorer

### Phase 4: Personalization (Features 6-8)
1. Implement recommendation engine
2. Add cross-subreddit bridging
3. Implement temporal analysis
4. Add timeline visualizations

---

## Cost Considerations

### OpenAI Embeddings (text-embedding-3-small)
- $0.02 per 1M tokens
- Average claim: ~20 tokens
- 1000 claims ≈ $0.0004
- Very cost-effective for this use case

### Local Embeddings (Ollama)
- Free, runs locally
- Requires GPU for speed
- Models: nomic-embed-text, all-minilm
- Slightly lower quality but zero cost

### Recommendation
- Development: Use Ollama for zero-cost iteration
- Production: Use OpenAI for quality, with caching
- Hybrid: Ollama for bulk backfill, OpenAI for new claims

---

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Deduplication | Duplicate detection rate | >90% |
| Deduplication | False positive rate | <5% |
| Search | Relevant results in top 5 | >80% |
| Related Claims | User satisfaction (useful links) | >70% |
| Contradictions | Precision on detected conflicts | >85% |
| Clustering | Coherent theme labels | >75% |

---

## Detailed Plans

- [01-semantic-claim-deduplication.md](./01-semantic-claim-deduplication.md)
- 02-natural-language-search.md (TODO)
- 03-related-claims-discovery.md (TODO)
- 04-contradiction-detection.md (TODO)
- 05-theme-clustering.md (TODO)
- 06-personalized-recommendations.md (TODO)
- 07-cross-subreddit-bridging.md (TODO)
- 08-temporal-semantic-analysis.md (TODO)
