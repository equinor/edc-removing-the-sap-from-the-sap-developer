# Exercise 3 - Consume API "Business Partner" from S/4

From a modelling point of view, there is no difference between consuming
data from another CAP app (like you did in the previous exercise) or consuming
an API:
* you import a package that describes the API
* you define consumption views on top of the imported entities 
* you use the consumption views in the model

In this exercise, you will import the metadata for S/4 Data Product "Customer" to the xtravels app.
You will then replace local entity `Passenger` with entity `Customer` from the Business Partner API.

<br>![](/intro-to-cap/ex3/images/03_00_0010.png)



## Exercise 3.1 - Discovery

After completing these steps, you will have found BPI "Business Partner" from S/4
in [SAP Business Accelerator Hub](https://api.sap.com/).

1. Go to [SAP Business Accelerator Hub](https://api.sap.com/).

    <br>![](/intro-to-cap/ex3/images/03_01_0010.png)

2. Select the Product "SAP S/4HANA Cloud Private Edition".
3. Select APIs and ODATA V2. Search for Business Partner. Select the API called "Business Partner (A2X)". 

    <br>![](/intro-to-cap/ex3/images/business_partner_search.png)

4. Log on with your SAP user and view the API documentation. Under the API Reference tab you can find the various endpoints including Customer which is the one we will use. 

Note: You can also try the Joule AI assistant to find this API. Try requesting something like: " I am on S/4 private cloud and am looking for an odata API for Business Partner with endpoint Customer". It may or may not work (the assistant is in beta phase and seems to freeze a lot :) )


## Exercise 3.2 - Download API metadata

After completing these steps, you will have downloaded a EDMX file with the metadata of
API "Business Partner (A2X) " to _ws/xtravels_.

1. At the bottom of the screen for API "Business Partner (A2X)" go the the API Specification section and download the EDMX

    <br>![](/intro-to-cap/ex3/images/download_edmx.png)

2. Copy the file to folder _xtravels_ in your workspace.



## Exercise 3.3 - Import API metadata

After completing these steps, you will have imported the API's
metadata as API package into your xtravels project.

1. Go to the terminal of the xtravels app.

2. Import the Data Product metadata to the CDS model of the xtravels app
with this command:
    ```sh
    cds import OP_API_BUSINESS_PARTNER_SRV.edmx --as cds
    ```

    The import creates a folder _xtravels\srv\external with a new cds file.

   <br>![](/intro-to-cap/ex3/images/srv_external.png)



4. Have a look at file _OP_API_BUSINESS_PARTNER_SRV.cds_ in the new folder.  
Here you find the API Business Partner` represented as a service,
and the endpoints of the API are represented as entities:
    ```cds
    @cds.external : true
    @m.IsDefaultEntityContainer : 'true'
    @sap.message.scope.supported : 'true'
    @sap.supported.formats : 'atom json xlsx'
    service OP_API_BUSINESS_PARTNER_SRV {
      @cds.external : true
      @cds.persistence.skip : true
      @sap.content.version : '1'
      @sap.label : 'Email Address'
      entity A_AddressEmailAddress {
        @sap.display.format : 'UpperCase'
        @sap.label : 'Address Number'
        key AddressID : String(10) not null;
        @sap.display.format : 'UpperCase'
        @sap.label : 'Person Number'
        key Person : String(10) not null;
        @sap.display.format : 'NonNegative'
        //...
      }
      //...
    }
    ```

    The name of the service reflects the ORD ID of the API.

5. Have a closer look at the new file.  
The API entities come with a lot of annotations, e.g. `@label` for labels.

6. Have a look at file _xtravels/package.json_. A new cds section has been added:

    <br>![](/intro-to-cap/ex3/images/package_json_dependency.png)


7. In the xtravels terminal, run
    ```sh
    npm install
    ```



## Exercise 3.4 - Add consumption view

After completing these steps, you will have a CDS view that acts as
interface to entity `Customer` of the imported API.

1. In folder _xtravels/db_, add a new file _customers.cds_.

2. Fill the new file with this content:
    ```cds
    using {OP_API_BUSINESS_PARTNER_SRV as external} from '../srv/external/OP_API_BUSINESS_PARTNER_SRV';

    namespace sap.capire.travels.masterdata;
    
    @federated entity Customers as projection on external.A_Customer {
	  Customer as ID,
	  CustomerName as FullName,
	  FiscalAddress as Street,
	  FiscalAddress as City,
	  CityCode as PostalCode,
	  CityCode as PhoneNumber,
    }
    ```

This is a so called "consumption" view that acts as single point of
access to the API entity. All references to the API
in your app's model and custom code should address this entity.

In the consumption view, you select only those elements of the API entity
that you actually want to use in your application.
In addition, the fields of the imported API entity `Customer` are renamed so
that they match those of entity `Passengers`, which you are going to replace.

You won't use the other entities of the API in our xtravels app,
thus you don't add consumption views for them.



## Exercise 3.5 - Use the API in the model

After completing these steps, you will have replaced local entity `Passenger`
with entity `Customer` of the Data Product.

1. In file _xtravels/db/schema.cds_, below the `using` directives at the top of the file, add
    ```cds
    using {
      sap.capire.travels.masterdata.Customers // the consumption view
    } from './customers';
    ```

2. In the same file, adapt entity `Travels` so that it now uses the consumption view `Customer` instead
of entity `Passengers`.  
    Change the target of association `Customer` from
    ```cds
    Customer     : Association to Passengers;
    ```
    to
    ```cds
    Customer     : Association to Customers;
    ```

3. In file _xtravels/srv/travel-service.cds_, add a projection for
    `Customer` below the projection for `Passenger` inside service `TravelService`:
    ```cds
      entity Customers as projection on db.masterdata.Customers;
    ```

No further adaptations of the model are necessary. This of course is only possible
because the xtravels app was from the beginning designed in such a way that
entity `Passengers` can easily be replaced by the Data Product entity `Customers`.



## Exercise 3.6 - Connect to S/4 for real data

After completing these steps, you will have run the xtravels app with
the API entity `Customers` reading data from the S/4 sandbox system S09.
1. Odata service in S/4
   <br>![](/intro-to-cap/ex3/images/sap_services.png)


2. Destination
   Connection to S/4 is done via the BTP destination service. A destination is an object in BTP specifying the URL for the API + logon info. This destination has already been created.
   Since you are already using the Business Application Studio for the development you are already logged onto BTP and have access to the destinations in BTP.

    <br>![](/intro-to-cap/ex3/images/BTP_destination.png)

   Architecture:

    <br>![](/intro-to-cap/ex3/images/simple_cap_btp_destination_cloudconnector_s4.png)

2. package.json
   You have defined the new service. And now it needs to connect to the destination and the correct odata service in S/4.
   Adjust the following cds section in the package.json file
    ```json
        "cds": {
        "requires": {
          "connectivity": true,
          "destination": true,
          "html5-repo": true,
          "authentication": "xsuaa",
          "OP_API_BUSINESS_PARTNER_SRV": {
            "kind": "odata-v2",
            "model": "srv/external/OP_API_BUSINESS_PARTNER_SRV",
            "credentials": {
              "destination": "EDC_API_BUSINESS_PARTNER",
              "path": "/sap/opu/odata/sap/API_BUSINESS_PARTNER"
            }
        }
      }
    ```
   
3. .env file
   Create a new .env file and add the following
   ```env
   destinations=[{"name":"EDC_API_BUSINESS_PARTNER","proxyHost":"http://127.0.0.1","proxyPort":"8887","url":"http://EDC_API_BUSINESS_PARTNER.dest"}]
   ```
   EDC_API_BUSINESS_PARTNER is the destination to the on-premise system configured in BTP on the account level. After setting up the configuration, you may need to reload the local host by running the following command in the terminal:

   ```sh
   curl localhost:8887/reload
   ```

5. Add the following code in the travel-service.js file. This will trigger the API call in S/4

```js
 const { Customers } = this.entities;
	const service = await cds.connect.to('OP_API_BUSINESS_PARTNER_SRV');
	console.log(`Connected to API_BUSINESS_PARTNER service`);
	this.on('READ', Customers, request => {
		return service.tx(request).run(request.query);
	});
```
   

5. In the xtravels terminal, run
  ```sh
  cds watch
  ```


6. Open the automatically served index page in your browser at [localhost:4004](http://localhost:4004/).

7. Click the link [/travels/webapp](http://localhost:4004/travels/webapp/index.html) to start the Fiori UI.  

    <br>![](/exercises/ex3/images/03_06_0030.png)

The app looks almost like the last time you have started it
in [Exercise 2.5](../ex2/README.md#exercise-25---run-the-xtravels-app-with-flights-being-mocked).
This time, however, you see different data for "Customer", namely the data from S/4.



## Exercise 3.7 - Cleanup

Stop `cds watch` by typing `Ctrl+C` into the xtravels terminal.



## Summary

You've now imported S/4 API "Business Partner" and tested the app


