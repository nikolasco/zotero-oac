/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright (c) 2006  Center for History and New Media
                        George Mason University, Fairfax, Virginia, USA
                        http://chnm.gmu.edu
    
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
 * Constructor for Item object
 *
 * Generally should be called through Zotero.Items rather than directly
 */
Zotero.AXEdb = function() {

	this._init();
	
}

Zotero.AXEdb.prototype._init = function () {
	// Primary fields
	this._id = null;
	this._type = null
	this._arrPoints = [];
	this._itemTypeID = null;
}


Zotero.AXEdb.prototype.saveRegion = function(intNoteID, intRegionType, arrValuesList){
	
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
	
	//check and make sure we got a region ID back from the insert.
	//if so, continue process.  If not, fire an alert and abort process.
	if (intRegionType > 0) {
		
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
			
			var sql = "INSERT INTO axeRegionPoints (regionID, regionFieldID, regionFieldValue, regionFieldOrder) VALUES ('"+insertID+"', '"+intFieldType+"', '"+strItemValue+"', '"+strItemOrder+"')";
			var insertStatement = Zotero.DB.getStatement(sql);
		
				
			try {
				insertStatement.execute();
			}
			catch (e) {
				throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
			}

		}
	
		alert("Saved a bogus Region with region ID "+insertID);
		
	} else {
		alert("[ERROR: No insert ID returned from INSERt axeRegion query in Zotero.AXEdb.prototype.saveRegion]");
	}
	
}


Zotero.AXEdb.prototype.getRegion = function(intNoteID){

	//// 	NOT WORKING AT ALL RIGHT NOW

	var sql = "SELECT axeRegion.regionID, axeRegion.regionType,   FROM 
	var row = Zotero.DB.rowQuery(sql, params);
	
	if (!row) {
		if (allowFail) {
			this._primaryDataLoaded = true;
			return false;
		}
		throw ("Item " + (id ? id : libraryID + "/" + key)
				+ " not found in Zotero.Item.loadPrimaryData()");
	}
	
	this.loadFromRow(row);
	
	//// 	NOT WORKING AT ALL RIGHT NOW
	
	var sql = "INSERT INTO axeImageRegion (sourceItemID, pointX, pointY, pointOrder) VALUES ('1', '25', '75', '1')";
	var insertStatement = Zotero.DB.getStatement(sql);

		
	try {
		insertStatement.execute();
	}
	catch (e) {
		throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
	}
	
	alert("Saved a bogus Region");
	
}

