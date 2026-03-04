/**
 *
 * Run via:  npm run deploy
 * Which executes: cds deploy --to sqlite && node scripts/generate-embeddings.js
 *
 * This script:
 *  1. Reads products from the SQLite database (populated by cds deploy)
 *  2. Connects to HANA Cloud
 *  3. Drops + recreates the vector table
 *  4. Generates and inserts embeddings via SAP AI SDK
 */

const path = require('path');
const fs = require('fs');
const hana = require('@sap/hana-client');

// Point CDS at the project root before requiring it
process.chdir(path.join(__dirname, '..'));
const cds = require('@sap/cds');

const { AzureOpenAiEmbeddingClient } = require('@sap-ai-sdk/foundation-models');

const { embeddingModel: EMBEDDING_MODEL, resourceGroup: RESOURCE_GROUP,
    embeddingBatchSize: BATCH, vectorTable: VECTOR_TABLE } = require('../config');

/* ── HANA helpers ─────────────────────────────────────────────── */

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

/* ── Product text format ──────────────────────────────────────── */

function productToText(p) {
    return [
        `PRODUCT_ID: ${p.ID}`,
        `PRODUCT_NAME: ${p.productName}`,
        `CATEGORY: ${p.category}`,
        `DESCRIPTION: ${p.description}`,
        `UNIT_PRICE: ${p.unitPrice}`,
        `SUPPLIER_ID: ${p.supplierID}`,
        `SUPPLIER_NAME: ${p.supplierName}`,
        `LEAD_TIME_DAYS: ${p.leadTimeDays}`,
        `MIN_ORDER: ${p.minOrder}`,
        `CURRENCY: ${p.currency}`,
        `SUPPLIER_COUNTRY: ${p.supplierCountry}`,
        `SUPPLIER_ADDRESS: ${p.supplierAddress}`,
        `STATUS: ${p.status}`,
        `SUPPLIER_CITY: ${p.supplierCity}`,
        `STOCK_QUANTITY: ${p.stockQuantity}`,
        `MANUFACTURER: ${p.manufacturer}`,
        `RATING: ${p.rating}`,
    ].join('\n');
}

function escapeSql(str) {
    return String(str).replace(/'/g, "''");
}

/* ── Main ─────────────────────────────────────────────────────── */

async function main() {
    // 1 — Load products from SQLite
    console.log('[embed] Connecting to SQLite...');
    const db = await cds.connect.to('db');
    const products = await db.run(SELECT.from('edc.rag.Products'));
    if (!products.length) throw new Error('No products found in SQLite. Run "cds deploy --to sqlite" first.');
    console.log(`[embed] Loaded ${products.length} products from SQLite`);

    // 2 — Connect to HANA
    console.log('[embed] Connecting to HANA Cloud...');
    const conn = await connectToHana();
    console.log('[embed] HANA Cloud connection established');
    console.log(`[embed] Using vector table: ${VECTOR_TABLE}`);

    // 3 — Recreate vector table
    try { await hanaExec(conn, `DROP TABLE "${VECTOR_TABLE}"`); } catch { /* ok if not exists */ }
    await hanaExec(conn, `
        CREATE TABLE "${VECTOR_TABLE}" (
            "VEC_TEXT"   NCLOB,
            "VEC_META"   NCLOB,
            "VEC_VECTOR" REAL_VECTOR
        )
    `);
    console.log(`[embed] Vector table "${VECTOR_TABLE}" recreated`);

    // 4 — Generate and insert embeddings in batches
    const texts = products.map(productToText);
    const embeddingClient = new AzureOpenAiEmbeddingClient({ modelName: EMBEDDING_MODEL, resourceGroup: RESOURCE_GROUP });
    let count = 0;

    for (let i = 0; i < texts.length; i += BATCH) {
        const batchTexts = texts.slice(i, i + BATCH);
        const embRes = await embeddingClient.run({ input: batchTexts });
        const vectors = embRes.getEmbeddings();

        for (let j = 0; j < vectors.length; j++) {
            const meta = JSON.stringify({ source: 'product_catalog.csv', row: i + j });
            await hanaExec(conn,
                `INSERT INTO "${VECTOR_TABLE}" ("VEC_TEXT", "VEC_META", "VEC_VECTOR")
                 VALUES ('${escapeSql(batchTexts[j])}', '${escapeSql(meta)}', TO_REAL_VECTOR('${JSON.stringify(vectors[j])}'))`
            );
            count++;
        }

        console.log(`[embed] Batch ${Math.floor(i / BATCH) + 1}: ${count}/${texts.length} embeddings inserted`);
    }

    conn.disconnect();
    console.log(`[embed] Done. ${count} embeddings stored in "${VECTOR_TABLE}"`);
}

main().catch((err) => {
    console.error('[embed] Error:', err.message);
    process.exit(1);
});
