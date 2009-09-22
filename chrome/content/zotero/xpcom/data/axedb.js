/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright (c) 2006  Maryland Institute for Technology in the Humanities
    					University of Maryland
    					College Park, Maryland, USA
                        http://mith2.umd.edu
    
    Licensed under the Educational Community License, Version 1.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
    
    http://www.opensource.org/licenses/ecl1.php
    
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
    
    ***** END LICENSE BLOCK *****
*/


/*
 * Constructor
 */
Zotero.AXEdb = function() {

	this._init();
	
}


// initiallized object parameters
Zotero.AXEdb.prototype._init = function () {
	// Primary fields
	this._id = null;
	this._type = null
	this._arrPoints = [];
	this._itemTypeID = null;
}

//Save a region record in database and associates with an Item type Note in the Item db table
Zotero.AXEdb.prototype.saveRegionItem = function(intNoteID, intRegionType){
	
	//setup a values array based upon @args to send to the zotero.DB.query object
	var sqlValues = new Array();
	sqlValues[0] = intNoteID;
	sqlValues[1] = intRegionType;
	
	//construct a base insert statement to create the region entry and get ID
	var sql = "INSERT INTO axeRegion (sourceItemID, regionType) VALUES (?, ?)";
	var insertStatement = Zotero.DB.getStatement(sql);
	var insertID = 0;	
	try {
		insertID = Zotero.DB.query(sql, sqlValues);
	}
	catch (e) {
		throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
	}

	return insertID;
	
}

// receives a region ID and a list of point values as array and writes list to axeRegionPoints table
Zotero.AXEdb.prototype.saveRegionPoints = function(intRegionID, arrValuesList){
	
	if (intRegionID > 0) {
		
		//now that we have  a region ID, based upon type, we need to loop
		//through the arrValuesList array and write entries to the axeRegionPoints table
		
		//first assign the sub array slices to sub arrays
		var arrFieldTypes = arrValuesList[0];
		var arrItemValues = arrValuesList[1];
		var arrItemOrder = arrValuesList[2];
		
		//now, loop through the sub arrays, grab values, and write to the db accordingly
		for ( var i=0, len=arrFieldTypes.length; i<len; ++i ){
		
			var intFieldType = 0;
			var strItemValue = 0;
			var strItemOrder = 0;
		
			intFieldType = arrFieldTypes[i];
			strItemValue = arrItemValues[i];
			strItemOrder = arrItemOrder[i];
			
			var sql = "INSERT INTO axeRegionPoints (regionID, regionFieldID, regionFieldValue, regionFieldOrder) VALUES ('"+intRegionID+"', '"+intFieldType+"', '"+strItemValue+"', '"+strItemOrder+"')";
			var insertStatement = Zotero.DB.getStatement(sql);
		
				
			try {
				insertStatement.execute();
			}
			catch (e) {
				throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
			}

		}
	
		//alert("Saved a bogus Region with region ID "+insertID);
		
	} else {
		alert("[ERROR: Invalid RegionID in Zotero.AXEdb.prototype.saveRegion]");
	}
	
}

// deletes regin point info for a given region from axeRegionPoints table
Zotero.AXEdb.prototype.deleteRegionPoints = function(intRegionID){
	
	if (intRegionID > 0) {
		
		var sql = "DELETE FROM axeRegionPoints WHERE regionID = '"+intRegionID+"'";
		var insertStatement = Zotero.DB.getStatement(sql);		
		try {
			insertStatement.execute();
		}
		catch (e) {
			throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
		}

		
	} else {
		alert("[ERROR: Invalid RegionID in Zotero.AXEdb.prototype.deleteRegionPoints]");
	}
	
}

//selects all region point information for a given region from axeRegionPoints
//and returns info ina  multi dimension array
Zotero.AXEdb.prototype.getRegion = function(intRegionID){

	//// 	NOT WORKING AT ALL RIGHT NOW
	
	var arrRegionMap = new Array();  //master array which packages data arrays
	var arrRegionFields = new Array(); //holds field type ID for the given point
	var arrRegionValues = new Array(); //holds point value for the given point
	var arrRegionOrder = new Array(); //holds order value for the given point

	var sql = "SELECT axeRegionPoints.regionID, axeRegionPoints.regionFieldID, axeRegionPoints.regionFieldValue, axeRegionPoints.regionFieldOrder FROM axeRegionPoints WHERE axeRegionPoints.regionID = '"+intRegionID+"' ORDER BY axeRegionPoints.regionFieldOrder";
	var rows = Zotero.DB.query(sql, "");
	
	for(var liCount=0;liCount<rows.length;liCount++) {
			var row = rows[liCount];
			arrRegionFields[liCount] = row['regionFieldID'];
			arrRegionValues[liCount] = row['regionFieldValue'];
			arrRegionOrder[liCount] = row['regionFieldOrder'];
	}
	
	arrRegionMap[0] = arrRegionFields;
	arrRegionMap[1] = arrRegionValues;
	arrRegionMap[2] = arrRegionOrder;	

	return arrRegionMap;
	
}

//selects all regions that belong to a given item
//and returns region ID and type in a  multi dimension array
Zotero.AXEdb.prototype.getRegionList = function(intItemID){

	//// 	NOT WORKING AT ALL RIGHT NOW
	
	var arrNoteList = new Array();  //master array which packages data arrays
	var arrNoteItemIDs = new Array();  //holds region IDs
	var arrNoteItemTypes = new Array();  //holds region type IDs
	
	var sql = "SELECT axeRegion.regionID, axeRegion.regionType FROM axeRegion WHERE axeRegion.sourceItemID IN (SELECT DISTINCT itemNotes.itemID FROM itemNotes WHERE itemNotes.sourceItemID = '"+intItemID+"')";
	var rows = Zotero.DB.query(sql, "");
	
	for(var liCount=0;liCount<rows.length;liCount++) {
			var row = rows[liCount];
			arrNoteItemIDs[liCount] = row['regionID'];
			arrNoteItemTypes[liCount] = row['regionType'];
	}
	
	arrNoteList[0] = arrNoteItemIDs;
	arrNoteList[1] = arrNoteItemTypes;

	return arrNoteList;
	
}

