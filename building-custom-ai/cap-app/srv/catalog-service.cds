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
