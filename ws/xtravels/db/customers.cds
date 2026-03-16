using {SAP_ICSM_BusinessPartnerExt as external} from '../srv/external/SAP_ICSM_BusinessPartnerExt';

namespace sap.capire.travels.masterdata;

@federated entity Customers as projection on external.A_Customer {
  Customer as ID,
  CustomerName as FullName,
  FiscalAddress as Street,
  CityCode as PostalCode,
}