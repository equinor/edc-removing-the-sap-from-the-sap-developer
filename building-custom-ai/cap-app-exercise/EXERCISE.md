# Building a RAG API with SAP CAP

In the previous exercise you built a RAG pipeline in a Jupyter notebook: you loaded product data, generated vector embeddings, stored them in SAP HANA Cloud, and used similarity search to give an LLM the context it needs to answer questions accurately.

In this exercise you will rebuild that same pipeline as a proper application using **SAP Cloud Application Programming Model (CAP)**. CAP is a framework for building enterprise-grade services on SAP Business Technology Platform. It uses a declarative language called **CDS** (Core Data Services) to define data models and service APIs, and Node.js (or Java) for the runtime logic.

By the end of this exercise you will have a running REST API that:

- Serves product data through a standard OData endpoint.
- Accepts a natural-language question, runs it through the RAG pipeline, and returns an answer with source citations.

---

## Prerequisites (Already installed in BAS)

- Node.js 18 or later installed.
- The `@sap/cds-dk` CLI installed globally (`npm i -g @sap/cds-dk`).
- The REST Client extension for VS Code (for sending test requests).
- You have completed the RAG notebook exercise.

---

## Setup

Before starting the exercises, you need to configure credentials and set your username.

### 1. Copy credentials

You received two credential files from the workshop organizers. Copy their contents into the corresponding files inside `cap-app-exercise/`:

| Source file (from organizers) | Target file in `cap-app-exercise/` | Purpose                                                           |
| ----------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `default-env.json`            | `default-env.json`                 | SAP AI Core credentials (for calling the LLM and embedding model) |
| `env_cloud.json`              | `env_cloud.json`                   | SAP HANA Cloud credentials (for the vector database)              |

Open each target file and replace the placeholder values with the real credentials.

### 2. Set your username

Open `config.js` and change the `userName` value from `'change_me'` to something unique, for example your Equinor username:

```js
const userName = 'abcd';
```

This username is appended to the HANA vector table name so that each participant gets their own table and does not overwrite anyone else's data.

---

## Exercise 1: Define the Database Schema

**File:** `db/schema.cds`

In CAP, the database schema is defined using CDS (Core Data Services). A `.cds` file describes your data model in a declarative way -- you define entities (which become database tables) and their fields, and CAP handles creating the actual tables for you.

Key concepts:

- **Namespace:** Groups related entities under a common prefix, similar to a package name. It prevents naming collisions when multiple modules are combined.
- **Entity:** Equivalent to a database table. Each entity has a set of typed fields.
- **`key` field:** Marks the primary key of the entity, just like a primary key in SQL.
- **Type annotations:** CDS types like `String(255)`, `Integer`, and `Decimal(10, 2)` map directly to SQL column types.

Replace the contents of `db/schema.cds` with the following:

```cds
namespace edc.rag;

entity Products {
    key ID              : String(10);
        productName     : String(255);
        category        : String(100);
        description     : String(5000);
        unitPrice       : Decimal(10, 2);
        supplierID      : String(10);
        supplierName    : String(255);
        leadTimeDays    : Integer;
        minOrder        : Integer;
        currency        : String(10);
        supplierCountry : String(100);
        supplierAddress : String(500);
        status          : String(50);
        supplierCity    : String(100);
        stockQuantity   : Integer;
        manufacturer    : String(255);
        cityLat         : Decimal(10, 7);
        cityLong        : Decimal(10, 7);
        rating          : Integer;
}
```

This defines a `Products` entity under the `edc.rag` namespace. The fields match the columns from the product catalog CSV you worked with in the notebook. When CAP deploys this schema, it creates a table with exactly these columns.

---

## Exercise 2: Expose Products as a Service

**File:** `srv/catalog-service.cds`

A CDS entity by itself is just a table definition -- it is not accessible over HTTP. To expose it as a REST API endpoint, you need to define a **service**. A CDS service is a named group of entities and operations that CAP exposes as an OData (or REST) API.

Key concepts:

- **`using ... from`:** Imports an entity from another CDS file, similar to an import statement.
- **`service ... @(path: '...')`:** Declares a service and sets its URL path. Everything inside the service block becomes part of that API.
- **`entity ... as projection on`:** Exposes an existing database entity through the service. A projection lets you control which fields are visible and whether the entity is read-only or read-write. It does not duplicate data -- it is a view over the underlying table.
- **`@readonly`:** An annotation that restricts the entity to read-only access (GET requests only). Clients cannot create, update, or delete records through this endpoint.

Replace the contents of `srv/catalog-service.cds` with:

```cds
using edc.rag from '../db/schema';

service CatalogService @(path: '/api') {

    @readonly
    entity Products as projection on rag.Products;
}
```

This creates a service called `CatalogService` accessible at `/api`. It exposes the Products entity as a read-only endpoint at `/api/Products`. CAP automatically provides OData query capabilities -- filtering, sorting, pagination -- with no additional code.

---

## Exercise 3: Verify the Data Layer

**What this step covers:** Understanding how CAP loads seed data, and verifying that exercises 1 and 2 work.

Look inside the `db/data/` folder. You will see a file named `edc.rag-Products.csv`. This file is already provided for you.

CAP has a convention for loading seed data: if a CSV file in `db/data/` is named `<namespace>-<Entity>.csv` (using the full namespace with dots replaced by dots and hyphens separating the entity name), CAP automatically loads that data into the corresponding table during deployment. In this case:

- Namespace: `edc.rag`
- Entity: `Products`
- Expected filename: `edc.rag-Products.csv`

This is the same product catalog you used in the notebook -- 75 IT accessories with names, prices, suppliers, ratings, and other attributes. The format is standard CSV (comma-delimited), with column names matching the entity field names from `schema.cds`.

### Test it

Run the following from the `cap-app-exercise/` directory:

```bash
npm install              # Install dependencies
cds deploy --to sqlite   # Deploy schema and load seed data into SQLite
cds watch                # Start the development server
```

`npm install` downloads all dependencies defined in `package.json`.

`cds deploy --to sqlite` deploys the CDS schema to a persistent SQLite file (`db.sqlite`) and loads the CSV seed data into it.

`cds watch` starts a local HTTP server on port 4004 that watches for file changes and restarts automatically.

Open your browser and navigate to:

- [http://localhost:4004](http://localhost:4004) -- The CAP welcome page, listing available services.
- [http://localhost:4004/api/Products](http://localhost:4004/api/Products) -- The Products endpoint, returning all 75 products as JSON.

If you see the product data, your schema, service definition, and seed data are all working correctly. Stop the server with `Ctrl+C` before continuing.

---

## Exercise 4: Create the Embedding Script

**File:** `scripts/generate-embeddings.js`

In the notebook you used Python with langchain and hdbcli to generate embeddings and store them in HANA Cloud. This script does the same thing in Node.js, using the SAP AI SDK and SAP HANA client library.

The script runs as part of the `npm run deploy` command. If you look at `package.json`, you will see:

```json
"deploy": "cds deploy --to sqlite && node scripts/generate-embeddings.js"
```

This means `npm run deploy` first deploys the CDS schema to the persistent SQLite file, then runs our embedding script which reads the products and stores their vector embeddings in HANA Cloud. In a real-world scenario we would probably not do this from a script, but instead include logic to ensure up-to-date embeddings at all times.

Open `scripts/generate-embeddings.js`. You will see that the helper functions (`connectToHana`, `hanaExec`, `productToText`) are already provided at the bottom of the file with comments explaining what they do. You only need to add the imports, configuration, and main function above them.

### 4a. Imports and configuration

Add the following at the top of the file (below the existing comment):

```js
const path = require('path');
const fs   = require('fs');
const hana = require('@sap/hana-client');

// CDS must be started from the project root to find package.json
process.chdir(path.join(__dirname, '..'));
const cds = require('@sap/cds');

const { AzureOpenAiEmbeddingClient } = require('@sap-ai-sdk/foundation-models');

const {
    embeddingModel:     EMBEDDING_MODEL,
    resourceGroup:      RESOURCE_GROUP,
    embeddingBatchSize: BATCH,
    vectorTable:        VECTOR_TABLE,
} = require('../config');
```

`@sap/hana-client` is the Node.js driver for SAP HANA -- the equivalent of `hdbcli` from the notebook. `@sap-ai-sdk/foundation-models` provides the `AzureOpenAiEmbeddingClient`, which is the equivalent of `init_embedding_model()` from the notebook. The config values (model name, table name, batch size) come from the shared `config.js` file.

### 4b. Main function -- the indexing pipeline

```js
async function main() {
    // 1 -- Read products from SQLite (populated by cds deploy)
    const db = await cds.connect.to('db');
    const products = await db.run(SELECT.from('edc.rag.Products'));
    console.log(`[embed] Loaded ${products.length} products from SQLite`);

    // 2 -- Connect to HANA Cloud
    const conn = await connectToHana();
    console.log(`[embed] HANA connected. Using table: ${VECTOR_TABLE}`);

    // 3 -- Drop and recreate the vector table
    try { await hanaExec(conn, `DROP TABLE "${VECTOR_TABLE}"`); } catch { /* ok if table does not exist yet */ }
    await hanaExec(conn, `
        CREATE TABLE "${VECTOR_TABLE}" (
            "VEC_TEXT"   NCLOB,
            "VEC_VECTOR" REAL_VECTOR
        )
    `);

    // 4 -- Generate embeddings and insert in batches
    const texts = products.map(productToText);
    const client = new AzureOpenAiEmbeddingClient({ modelName: EMBEDDING_MODEL, resourceGroup: RESOURCE_GROUP });
    let count = 0;

    for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH);
        const res   = await client.run({ input: batch });
        const vecs  = res.getEmbeddings();

        for (let j = 0; j < vecs.length; j++) {
            const escaped = String(batch[j]).replace(/'/g, "''");
            await hanaExec(conn,
                `INSERT INTO "${VECTOR_TABLE}" ("VEC_TEXT", "VEC_VECTOR")
                 VALUES ('${escaped}', TO_REAL_VECTOR('${JSON.stringify(vecs[j])}'))`
            );
            count++;
        }
        console.log(`[embed] Batch ${Math.floor(i / BATCH) + 1}: ${count}/${texts.length} inserted`);
    }

    conn.disconnect();
    console.log(`[embed] Done. ${count} embeddings stored in "${VECTOR_TABLE}"`);
}

main().catch(err => { console.error('[embed]', err.message); process.exit(1); });
```

This is the core pipeline -- the same four steps from the notebook's indexing section:

1. **Load data.** Instead of `pd.read_csv()`, we use CDS to read from the SQLite database that `cds deploy` populated.
2. **Connect to HANA Cloud.** Same as `hdbcli.dbapi.connect()` in the notebook.
3. **Create the vector table.** The table has two columns: `VEC_TEXT` (the original product text as a large string) and `VEC_VECTOR` (the embedding, stored as HANA's native `REAL_VECTOR` type). `TO_REAL_VECTOR()` converts a JSON array of numbers into this type.
4. **Generate and store embeddings.** Products are processed in batches of 25. For each batch, we call the embedding model and insert each resulting vector into HANA.

### Notebook mapping

| Notebook step                     | Script equivalent                         |
| --------------------------------- | ----------------------------------------- |
| `pd.read_csv(...)`                | `SELECT.from('edc.rag.Products')` via CDS |
| `hdbcli.dbapi.connect(env_cloud)` | `connectToHana()`                         |
| `init_embedding_model(...)`       | `new AzureOpenAiEmbeddingClient(...)`     |
| `HanaDB.from_documents(...)`      | `INSERT ... TO_REAL_VECTOR(...)`          |

---

## Exercise 5: Deploy and Generate Embeddings

Now run the deployment:

```bash
npm run deploy
```

This executes two steps:

1. **`cds deploy --to sqlite`** -- Creates the SQLite database file, applies the schema, and loads the CSV seed data. You should see output like:
   ```
   [cds] - loaded model from 2 file(s):
     db/schema.cds
     srv/catalog-service.cds
   /> successfully deployed to db.sqlite
   ```

2. **`node scripts/generate-embeddings.js`** -- Connects to HANA Cloud, creates your personal vector table, and generates embeddings for all 75 products. You should see output like:
   ```
   [embed] Loaded 75 products from SQLite
   [embed] HANA connected. Using table: PRODUCTS_IT_ACCESSORY_CAP_ABCD
   [embed] Batch 1: 25/75 inserted
   [embed] Batch 2: 50/75 inserted
   [embed] Batch 3: 75/75 inserted
   [embed] Done. 75 embeddings stored in "PRODUCTS_IT_ACCESSORY_CAP_ABCD"
   ```

If you see errors, check that your credentials in `env_cloud.json` and `default-env.json` are correct, and that your `config.js` username is set.

---

## Exercise 6: Add the RAG Action to the Service

**File:** `srv/catalog-service.cds`

Your service currently only exposes the Products entity for basic reads. Now you will extend it with a custom **action** that accepts a natural-language question and returns a RAG-generated answer.

Key concepts:

- **`type`:** Defines a structured return type, similar to a class or interface. It describes the shape of the data the action will return.
- **`action`:** A custom operation exposed as a POST endpoint. Unlike entity reads (which are GET requests), an action performs a specific operation -- in this case, running the RAG pipeline.
- **`array of { ... }`:** An inline anonymous type for arrays of structured objects.

Replace the contents of `srv/catalog-service.cds` with:

```cds
using edc.rag from '../db/schema';

service CatalogService @(path: '/api') {

    @readonly
    entity Products as projection on rag.Products;

    // RAG query
    type RAGResponse {
        answer  : LargeString;
        sources : array of {
            productID   : String;
            productName : String;
            score       : Double;
        };
    }

    action askQuestion(question: String) returns RAGResponse;
}
```

Notice that the Products projection from Exercise 2 is unchanged. You added two things:

1. **`RAGResponse` type** -- The return type for the RAG action. It contains:
   - `answer`: The LLM-generated text response (using `LargeString` because answers can be long).
   - `sources`: An array of the products that the vector search found most relevant, each with a relevance score.

2. **`askQuestion` action** -- Takes a `question` string as input and returns a `RAGResponse`. CAP will expose this as `POST /api/askQuestion`.

---

## Exercise 7: Implement the Service Handler

**File:** `srv/catalog-service.js`

In CAP, a `.cds` service definition declares the contract (what the API looks like), and a `.js` file with the same name implements the behavior (what happens when someone calls the API). CAP automatically pairs them by filename -- `catalog-service.cds` and `catalog-service.js`.

Open `srv/catalog-service.js`. The file already contains:

- The **class skeleton** -- the `CatalogService` class, `init()` method, and `return super.init()` are structured for you. You just need to fill in the logic at the marked locations.
- The **helper functions** (`connectToHana`, `hanaExec`, `extractField`, `buildPrompt`) at the bottom, with comments explaining what they do.

You need to add three things: the configuration (7a), the HANA connection block (7b), and the askQuestion handler (7c).

### 7a. Configuration

Add the following below the `Exercise 7a` comment at the top of the file:

```js
const {
    embeddingModel: EMBEDDING_MODEL,
    llmModel:       LLM_MODEL,
    resourceGroup:  RESOURCE_GROUP,
    topK:           TOP_K,
    vectorTable:    VECTOR_TABLE,
} = require('../config');
```

These config values come from the shared `config.js` file: `LLM_MODEL` (for the chat model), `EMBEDDING_MODEL` (for generating query embeddings), `TOP_K` (how many results to retrieve from the vector search), and `VECTOR_TABLE` (the HANA table name). The `cds` import and `hanaConn` variable are already in the skeleton. Note that `path`, `fs`, and `hana` are already imported by the helper functions at the bottom of the file.

### 7b. HANA connection on startup

Add the following below the `Exercise 7b` comment, inside `init()`:

```js
        cds.on('served', async () => {
            try {
                hanaConn = await connectToHana();
                console.log('[rag] HANA Cloud connected');
            } catch (err) {
                console.error('[rag] Could not connect to HANA:', err.message);
            }
        });
```

`cds.on('served')` registers a callback that fires after all services are up and the HTTP server is listening. This is where we establish the HANA connection that will be reused for every incoming request.

### 7c. The askQuestion handler -- the RAG pipeline

Add the following below the `Exercise 7c` comment, inside `init()`:

```js
        this.on('askQuestion', async (req) => {
            const { question } = req.data;
            if (!hanaConn) return req.error(503, 'HANA connection not ready');

            const { AzureOpenAiEmbeddingClient, AzureOpenAiChatClient } =
                require('@sap-ai-sdk/foundation-models');

            // Step 1 -- Embed the question
            const embeddingClient = new AzureOpenAiEmbeddingClient({ modelName: EMBEDDING_MODEL, resourceGroup: RESOURCE_GROUP });
            const embRes = await embeddingClient.run({ input: [question] });
            const queryVector = embRes.getEmbedding(0);

            // Step 2 -- Vector similarity search in HANA Cloud
            const sql = `SELECT TOP ${TOP_K}
                    "VEC_TEXT",
                    COSINE_SIMILARITY("VEC_VECTOR", TO_REAL_VECTOR('${JSON.stringify(queryVector)}')) AS "SCORE"
                FROM "${VECTOR_TABLE}"
                ORDER BY COSINE_SIMILARITY("VEC_VECTOR", TO_REAL_VECTOR('${JSON.stringify(queryVector)}')) DESC`;

            const rows = await hanaExec(hanaConn, sql);

            // Step 3 -- Build context from retrieved documents
            const context = rows.map(r => r.VEC_TEXT).join('\n\n');

            // Step 4 -- Call the LLM with the augmented prompt
            const chatClient = new AzureOpenAiChatClient({ modelName: LLM_MODEL, resourceGroup: RESOURCE_GROUP });
            const chatRes = await chatClient.run({
                messages: [{ role: 'user', content: buildPrompt(context, question) }],
                max_completion_tokens: 4096,
            });

            const answer = chatRes.getContent();
            const sources = rows.slice(0, 10).map(r => ({
                productID:   extractField(r.VEC_TEXT, 'PRODUCT_ID'),
                productName: extractField(r.VEC_TEXT, 'PRODUCT_NAME'),
                score:       r.SCORE,
            }));

            return { answer, sources };
        });
```

These are the same four RAG steps from the notebook:

1. **Embed the question.** Convert the user's natural-language question into a vector using the same embedding model that was used to embed the products.
2. **Vector similarity search.** Run a SQL query against HANA Cloud that computes `COSINE_SIMILARITY` between the question vector and every product vector, returning the top 25 most similar results.
3. **Build context.** Concatenate the retrieved product texts into a single context string that the LLM can read.
4. **Call the LLM.** Send the context and question to the chat model using the same prompt template from the notebook. The LLM generates an answer grounded in the retrieved products.

The response includes both the LLM's `answer` and the `sources` -- the top 10 products from the vector search with their similarity scores, giving transparency into what the retrieval step found.

### Notebook mapping

| Notebook step                              | Handler equivalent                                       |
| ------------------------------------------ | -------------------------------------------------------- |
| `init_embedding_model(...)`                | `new AzureOpenAiEmbeddingClient(...)`                    |
| `embedding_model.embed_query(question)`    | `embeddingClient.run({ input: [question] })`             |
| `COSINE_SIMILARITY(...)` SQL               | Same SQL via `hanaExec()`                                |
| `retrieval_chain` context building         | `rows.map(r => r.VEC_TEXT).join(...)`                    |
| `init_llm(...)` + `chain.invoke(question)` | `new AzureOpenAiChatClient(...)` + `chatClient.run(...)` |
| `prompt_template`                          | `buildPrompt(context, question)`                         |

The difference is that here the pipeline runs inside a CAP service, triggered by an HTTP POST request, instead of being called interactively in a notebook cell.

---

## Exercise 8: Test the Application

Start the server:

```bash
cds watch
```

You should see output confirming that the service is running and the HANA connection is established:

```
[cds] - loaded model from 2 file(s):
  db/schema.cds
  srv/catalog-service.cds

[cds] - serving CatalogService { path: '/api' }

[cds] - server listening on { url: 'http://localhost:4004' }
[rag] HANA Cloud connected
```

### Test the Products endpoint

Open `test.http` in VS Code. The REST Client extension lets you send HTTP requests directly from the editor by clicking the "Send Request" link above each request block.

Start with the read-only Products requests at the bottom of the file:

- **Browse all products** -- `GET /api/Products` returns all 75 products.
- **Filter keyboards** -- `GET /api/Products?$filter=contains(productName,'Keyboard')&$orderby=unitPrice asc` returns only keyboards, sorted by price. The `$filter` and `$orderby` syntax is OData, which CAP supports out of the box.
- **Top 5 highest rated** -- `GET /api/Products?$orderby=rating desc&$top=5` returns the five highest-rated products.

### Test the RAG endpoint

Now try the RAG queries at the top of `test.http`. These are the same three test cases from the notebook:

1. **"Find all keyboards with RGB backlighting"** -- Should return multiple keyboards with RGB features.
2. **"What is the cheapest wireless mouse available? Return only one."** -- Should return the Logitech Signature M650 at 34.75 EUR.
3. **"Suggest a headset with a rating of 5. Return only one."** -- Should return one of the 5-star headsets.

Each response contains two parts:

- `answer`: The LLM-generated response -- a JSON array of matching products with all their details.
- `sources`: The top 10 most relevant products from the vector similarity search, with their cosine similarity scores.

The `sources` field lets you see which products the vector search retrieved and how relevant they were, giving you transparency into the RAG pipeline's retrieval step.

---

## Summary

You have built a complete RAG application using SAP CAP:

| Layer              | File                             | What it does                                                       |
| ------------------ | -------------------------------- | ------------------------------------------------------------------ |
| Data model         | `db/schema.cds`                  | Defines the Products table structure                               |
| Seed data          | `db/data/edc.rag-Products.csv`   | 75 products loaded automatically by CAP                            |
| Service definition | `srv/catalog-service.cds`        | Exposes the REST API with Products endpoint and askQuestion action |
| Service handler    | `srv/catalog-service.js`         | Implements the RAG pipeline (embed, search, augment, generate)     |
| Embedding script   | `scripts/generate-embeddings.js` | Converts products to vectors and stores them in HANA Cloud         |
| Configuration      | `config.js`                      | Central settings for models, table names, and parameters           |

The application follows the same RAG architecture from the notebook -- **indexing** (exercises 4-5) and **retrieval + generation** (exercise 7) -- but packaged as a REST API instead of interactive notebook cells.
