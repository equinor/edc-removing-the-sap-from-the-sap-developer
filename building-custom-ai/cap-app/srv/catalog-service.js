/**
 * CatalogService – mirrors the notebook's RAG pipeline:
 *
 *  ─────────────────────────────────────────────────────────
 *  hdbcli.dbapi.connect(env_cloud)    →  @sap/hana-client
 *  GenAIHubProxyClient + init_llm     →  AzureOpenAiChatClient
 *  init_embedding_model               →  AzureOpenAiEmbeddingClient
 *  HanaDB vector store                →  Direct SQL with REAL_VECTOR
 *  retrieval_chain.invoke(question)   →  GET /api/askQuestion(question=...)
 */
const cds = require('@sap/cds');
const hana = require('@sap/hana-client');
const path = require('path');
const fs = require('fs');

// ── Config ──
const { embeddingModel: EMBEDDING_MODEL, llmModel: LLM_MODEL, resourceGroup: RESOURCE_GROUP,
    topK: TOP_K, vectorTable: VECTOR_TABLE } = require('../config');

let hanaConn = null;

module.exports = class CatalogService extends cds.ApplicationService {

    async init() {
        // ── On startup: connect to HANA ──
        cds.on('served', async () => {
            try {
                hanaConn = await connectToHana();
                console.log('[rag] HANA Cloud connection established');

                const hasData = await hanaTableHasData(hanaConn, VECTOR_TABLE);
                if (!hasData) {
                    console.warn(`[rag] WARNING: Vector table "${VECTOR_TABLE}" is empty. Run "npm run deploy" to generate embeddings.`);
                } else {
                    console.log(`[rag] Vector table "${VECTOR_TABLE}" ready`);
                }
            } catch (err) {
                console.error('[rag] Startup error:', err.message);
            }
        });

        // ── askQuestion handler ──
        this.on('askQuestion', async (req) => {
            const { question } = req.data;
            if (!question) return req.error(400, 'Question is required');

            if (!hanaConn) return req.error(503, 'HANA connection not ready');

            const { AzureOpenAiEmbeddingClient, AzureOpenAiChatClient } =
                require('@sap-ai-sdk/foundation-models');

            // 1 ─ Embed the question 
            const embeddingClient = new AzureOpenAiEmbeddingClient({ modelName: EMBEDDING_MODEL, resourceGroup: RESOURCE_GROUP });
            const embRes = await embeddingClient.run({ input: [question] });
            const queryVector = embRes.getEmbedding(0);

            // 2 ─ Vector similarity search in HANA Cloud
            const sql = `SELECT TOP ${TOP_K}
                    "VEC_TEXT",
                    COSINE_SIMILARITY("VEC_VECTOR", TO_REAL_VECTOR('${JSON.stringify(queryVector)}')) AS "SCORE"
                FROM "${VECTOR_TABLE}"
                ORDER BY COSINE_SIMILARITY("VEC_VECTOR", TO_REAL_VECTOR('${JSON.stringify(queryVector)}')) DESC`;

            const rows = await hanaExec(hanaConn, sql);

            if (!rows.length) {
                return req.error(400, 'No embeddings found in HANA. Restart the server to generate them.');
            }

            // 3 ─ Build context from top-k 
            const context = rows.map(r => r.VEC_TEXT).join('\n\n');

            // 4 ─ Call LLM 
            const chatClient = new AzureOpenAiChatClient({ modelName: LLM_MODEL, resourceGroup: RESOURCE_GROUP });
            const chatRes = await chatClient.run({
                messages: [{ role: 'user', content: buildPrompt(context, question) }],
                max_completion_tokens: 4096,
            });

            const answer = chatRes.getContent();
            const sources = rows.slice(0, 10).map(r => ({
                productID: extractField(r.VEC_TEXT, 'PRODUCT_ID'),
                productName: extractField(r.VEC_TEXT, 'PRODUCT_NAME'),
                score: r.SCORE,
            }));

            return { answer, sources };
        });

        return super.init();
    }
};

/* ═══════════════════════════════════════════════════════════════
 *  HANA Cloud connection
 * ═══════════════════════════════════════════════════════════════ */

function loadHanaCredentials() {
    const envPath = path.join(__dirname, '..', 'env_cloud.json');
    return JSON.parse(fs.readFileSync(envPath, 'utf-8'));
}

function connectToHana() {
    return new Promise((resolve, reject) => {
        const creds = loadHanaCredentials();
        const conn = hana.createConnection();
        conn.connect({
            serverNode: `${creds.url}:${creds.port}`,
            uid: creds.user,
            pwd: creds.pwd,
            encrypt: true,
            sslValidateCertificate: false,
        }, (err) => {
            if (err) reject(err);
            else resolve(conn);
        });
    });
}

function hanaExec(conn, sql) {
    return new Promise((resolve, reject) => {
        conn.exec(sql, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function hanaTableHasData(conn, table) {
    try {
        const rows = await hanaExec(conn, `SELECT COUNT(*) AS "CNT" FROM "${table}"`);
        return rows[0]?.CNT > 0;
    } catch {
        return false;
    }
}

/* ═══════════════════════════════════════════════════════════════
 *  Helpers
 * ═══════════════════════════════════════════════════════════════ */

function extractField(vecText, field) {
    const match = vecText && vecText.match(new RegExp(`${field}:\\s*(.+)`));
    return match ? match[1].trim() : '';
}

/**
 * Same prompt template as notebook cell 46 (prompt_template).
 */
function buildPrompt(context, question) {
    return `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. Do not make up an answer.

Format the results as a list of JSON items with these keys:
    - "PRODUCT_ID"
    - "PRODUCT_NAME"
    - "CATEGORY"
    - "DESCRIPTION"
    - "UNIT_PRICE"
    - "SUPPLIER_ID"
    - "SUPPLIER_NAME"
    - "LEAD_TIME_DAYS"
    - "MIN_ORDER"
    - "CURRENCY"
    - "SUPPLIER_COUNTRY"
    - "SUPPLIER_ADDRESS"
    - "STATUS"
    - "SUPPLIER_CITY"
    - "STOCK_QUANTITY"
    - "MANUFACTURER"
    - "RATING"

Note:
    - The 'RATING' must be an integer from 0 (bad) to 5 (excellent).
    - Do not include markdown or code blocks like \`\`\`json.

${context}

Question: ${question}`;
}
