// ── User configuration ─────────────────────────────────────────
const userName = 'change_me';

// ── AI model settings ──────────────────────────────────────────
const embeddingModel = 'text-embedding-3-large';
const llmModel = 'gpt-5';
const resourceGroup = 'edc2026';

// ── RAG settings ───────────────────────────────────────────────
const topK = 25;
const embeddingBatchSize = 25;

// ── HANA vector table ──────────────────────────────────────────
const vectorTableBase = 'PRODUCTS_IT_ACCESSORY_CAP';
const vectorTable = `${vectorTableBase}_${userName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

// ── Validation ─────────────────────────────────────────────────
if (!userName || userName === 'change_me') {
    throw new Error('[config] Please set "userName" in config.js before running.');
}

module.exports = { userName, embeddingModel, llmModel, resourceGroup, topK, embeddingBatchSize, vectorTableBase, vectorTable };
