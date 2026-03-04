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
