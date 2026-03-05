/**
 * Embedding generation script.
 *
 * Run via:  npm run deploy
 * Which executes: cds deploy --to sqlite && node scripts/generate-embeddings.js
 */

// ── Exercise 4: Add imports, configuration, and main function below ──
// The helper functions at the bottom of this file are already provided for you.











/* ═══════════════════════════════════════════════════════════════
 *  Helper functions (pre-provided)
 * ═══════════════════════════════════════════════════════════════ */

// Reads HANA credentials from env_cloud.json and opens an encrypted connection.
// Equivalent to hdbcli.dbapi.connect(env_cloud) from the notebook.
function connectToHana() {
    const path = require('path');
    const fs = require('fs');
    const hana = require('@sap/hana-client');
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

// Formats a product record into a labeled multi-line string for embedding.
// This is the same format used in the notebook -- the embedding model converts
// this text into a vector that captures the product's semantic meaning.
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
