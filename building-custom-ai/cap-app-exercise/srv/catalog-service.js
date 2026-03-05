/**
 * CatalogService handler.
 *
 * Implements the RAG pipeline as a CAP service action:
 *   POST /api/askQuestion  ->  embed question -> vector search -> LLM call -> response
 */

// ── Exercise 7: Add imports, configuration, and service class below ──
// The helper functions at the bottom of this file are already provided for you.











/* ═══════════════════════════════════════════════════════════════
 *  Helper functions (pre-provided)
 * ═══════════════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const hana = require('@sap/hana-client');

// Reads HANA credentials from env_cloud.json and opens an encrypted connection.
// Equivalent to hdbcli.dbapi.connect(env_cloud) from the notebook.
function connectToHana() {
    const creds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'env_cloud.json'), 'utf-8'));
    return new Promise((resolve, reject) => {
        const conn = hana.createConnection();
        conn.connect({
            serverNode: `${creds.url}:${creds.port}`,
            uid: creds.user,
            pwd: creds.pwd,
            encrypt: true,
            sslValidateCertificate: false,
        }, err => err ? reject(err) : resolve(conn));
    });
}

// Runs a SQL statement on HANA and returns the result rows.
// Wraps the callback-based HANA client API in a Promise for async/await.
function hanaExec(conn, sql) {
    return new Promise((resolve, reject) => {
        conn.exec(sql, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

// Parses a field value out of the VEC_TEXT string (e.g. "PRODUCT_ID: P001" -> "P001").
// Used to build the sources array in the response.
function extractField(text, field) {
    const m = text.match(new RegExp(`${field}:\\s*(.+)`));
    return m ? m[1].trim() : '';
}

// Same prompt template as the notebook. Instructs the LLM to use only the
// provided context, format results as JSON, and not make up answers.
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
