// "Global" Axe functions for providing draggable functionality 
// to any element.

/**
 * Called to begin moving the annotation
 *
 * @param {Event} e DOM event corresponding to click on the grippy
 * @private
 */
var _startMove = function(e,doc,obj,DOM,resizing) {
	// stop propagation
	e.stopPropagation();
	e.preventDefault();
	
	var body = doc.getElementsByTagName("body")[0];

	// set the handler required to deactivate

	/**
	 * Listener to handle mouse moves on main page
	 * @inner
	 */
	var handleMoveMouse1 = function(e) {
		if (resizing) {
			_resizeBox(obj,DOM,e.pageX + 1, e.pageY + 1);
		}
		else{
			_displayWithAbsoluteCoordinates(obj,DOM,e.pageX + 1, e.pageY + 1);
		}
	};
	/**
	 * Listener to handle mouse moves in iframe
	 * @inner
	 */


	
	/**
	 * Listener to finish off move when a click is made
	 * @inner
	 */
	var handleMove = function(e) {
			
		doc.removeEventListener("mousemove", handleMoveMouse1, true);
	
		DOM.removeEventListener("mousemove", handleMove, true);
	DOM.removeEventListener("mouseup", handleMove, true);
			doc.removeEventListener("mouseup", handleMove, true);
		doc.removeEventListener("click", handleMove, true);

		obj.update();
	
		// stop propagation
		e.stopPropagation();
		e.preventDefault();
	};	
	doc.addEventListener("mousemove", handleMoveMouse1, true);
	doc.addEventListener("mouseup", handleMove, true);
	DOM.addEventListener("mouseup", handleMove, true);
	body.style.cursor = "pointer";

}

var _resizeBox=function(obj,DOM,absX,absY){

	obj.DOM.style.width = absX-parseInt(obj.DOM.style.left)+"px";

	obj.DOM.style.height =  absY-parseInt(obj.DOM.style.top)+"px";

	DOM.style.top = parseInt(obj.DOM.style.top)+parseInt(obj.DOM.style.height)-10;
	DOM.style.left = parseInt(obj.DOM.style.left)+parseInt(obj.DOM.style.width)-10;
	
	//update the database
	//this.updateRectangleShift();
	return;
}
var _displayWithAbsoluteCoordinates = function(obj,DOM,absX, absY,scrollMax) {	
	DOM.style.left = absX+"px";
	obj.absX = absX;
	DOM.style.top =  absY+"px";
	obj.absY = absY;
	if (obj.resizeOutline) {
		obj.resizeOutline.style.top = parseInt(absY) + parseInt(DOM.style.height) - 10;
		obj.resizeOutline.style.left = parseInt(absX) + parseInt(DOM.style.width) - 10;
	}

	return;
}
/************
// AXEImage
************/

Zotero.AXEImage= function(Zotero_Browser, browser, itemID){

	this.Zotero_Browser = Zotero_Browser;
	this.browser = browser;
	this.document = browser.contentDocument;
	this.window = browser.contentWindow;
	this.itemID=itemID;
	this.scale=1;
	this.DOM = null;
	this.src = "";
	this.oHeight = 0;
	this.oWidth = 0;
	this.annotations = [];
	this.clickMode = 1;  // determines onClick behavior
						 // 0 = do nothing, 
						 // 1 = draw first node for polygon 
						 // 2 = draw another node on polygon
						 // 3 = complete polygon
	this.nodeArray = [];
	this.polygons = [];
	this.rectangles = [];
	this.curPolygon = 0;
	this.workingRegion = "";
	this.workingNode = 0;
	this.drawingState = false;
	this.regionType=0;
	this.zoomLevel = 0;
	head = this.document.getElementsByTagName("head")[0];
	
	link = this.document.createElement("link");
	link.href="zotero://attachment/axe.css";
	link.type="text/css";
	link.rel="stylesheet";
	head.appendChild(link);
	

				  
		
}
Zotero.AXEImage.prototype.getAllRegions = function(){
	
}
Zotero.AXEImage.prototype.loadImageFromPage = function(){
	

	
	var origSizeStr = this.document.title.toString();
	var strEnd = origSizeStr.indexOf(" pixels");
	var strBeg = origSizeStr.lastIndexOf(" ",strEnd-1);
	origSizeStr = origSizeStr.substring(strBeg,strEnd).split("x");
	
	
	this.img = this.document.getElementsByTagName("img")[0];
	this.img.style.width=parseInt(origSizeStr[0])+"px";
	this.img.style.height=parseInt(origSizeStr[1])+"px";
	this.DOM = this.document.createElement("div");
	this.DOM.appendChild(this.img.cloneNode(true));
	var body = this.document.getElementsByTagName("body")[0];
	body.appendChild(this.DOM);
	
	body.style.cursor = "pointer";

	this.img.parentNode.removeChild(this.img);	
	this.img = this.DOM.firstChild;
	this.img.style.width=parseInt(origSizeStr[0])+"px";
	this.img.style.height=parseInt(origSizeStr[1])+"px";
	this.oWidth = parseInt(this.img.style.width);
	this.oHeight = parseInt(this.img.style.height);
	this.zoomLevel = 0;
	//alert(this.img.style.width);
	this.img.style.cursor = "pointer";
		

		
	//draw existing regions from db
	//start by grabbinglist of region ids that belong to this item
	var sqlParent = "SELECT itemAttachments.sourceItemID FROM itemAttachments WHERE itemAttachments.itemID = '"+this.itemID+"'";
	var parentID = Zotero.DB.valueQuery(sqlParent, "");
	
	
	var axeRegionDBObj = new Zotero.AXEdb();
	var arrRegionList = axeRegionDBObj.getRegionList(parentID);
	var arrRIDs = arrRegionList[0];
	var arrRTypes = arrRegionList[1];
	
	//now loop through each item and grab the point informatino for the region
	for(var rliCount=0;rliCount<arrRTypes.length;rliCount++) {
		
		var intRType = arrRTypes[rliCount];
		var intRID = arrRIDs[rliCount];
		
		//get the region point list that belongs to this region
		var arrReturnedRegions = axeRegionDBObj.getRegion(intRID);
		if (arrReturnedRegions.length > 0) {
		
			//check the type and process accordingly
			if (intRType == 1) {
				this.regionType = 1;
				//alert("Drawing Rectangle ID: "+intRID);
				
				var intLeft = "";
				var intTop = "";
				var intRight = "";
				var intBottom = "";
				
				var arrRPType = arrReturnedRegions[0];
				var arrRPVal = arrReturnedRegions[1];
				var arrRPOrder = arrReturnedRegions[2];
				
				for(var rpCount=0;rpCount<arrRPType.length;rpCount++) {

					if (arrRPType[rpCount] == 1) {
						if (arrRPOrder[rpCount] == 1) {
							//alert("Writing intLeft");
							intLeft = arrRPVal[rpCount];
						} else if (arrRPOrder[rpCount] == 2) {
							//alert("Writing intRight");
							intRight = arrRPVal[rpCount];
						}
					} else if (arrRPType[rpCount] == 2) {
						if (arrRPOrder[rpCount] == 1) {
							//alert("Writing intTop");
							intTop = arrRPVal[rpCount];
						} else if (arrRPOrder[rpCount] == 2) {
							//alert("Writing intBottom");
							intBottom = arrRPVal[rpCount];
						}
					}
	
				}
				
									
				if (intLeft.length > 0 && intTop.length > 0 && intRight.length > 0 && intBottom.length > 0) {
					//alert("Ready to draw Rectangle: "+intRID);
					this.Zotero_Browser.toggleMode(null);
					var newRectRegion = new Zotero.AXE_rectangle(this,intRID,intLeft,intTop,intRight,intBottom);
					this.rectangles.push(newRectRegion);
					this.DOM.parentNode.appendChild(newRectRegion.DOM);
					this.DOM.parentNode.appendChild(newRectRegion.resizeOutline);
				} else {
					alert("Cannot draw Rectangle: "+intRID);
				}
				
				
			} else if (intRType == 2) {
				this.regionType = 2;
				this.workingNode = 1;
				this.workingRegion = intRID;
				
				var arrX = new Array();
				var arrY = new Array();
				
				var arrRPType = arrReturnedRegions[0];
				var arrRPVal = arrReturnedRegions[1];
				var arrRPOrder = arrReturnedRegions[2];
				
				var intLastOrder = arrRPOrder[arrRPOrder.length-1];
				var intOrderInc = 1;
				var intStackSlice = 0;
				var blnFoundX = false;
				var blnFoundY = false;
				
				for(var iCount=0;iCount<arrRPType.length;iCount++) {
					if (arrRPType[iCount] == 1) {
						arrX[intStackSlice] = arrRPVal[iCount];
						blnFoundX = true;
					} else if (arrRPType[iCount] == 2) {
						arrY[intStackSlice] = arrRPVal[iCount];
						blnFoundY = true;
					}
					if (blnFoundX && blnFoundY) {
						blnFoundX = false;
						blnFoundY = false;
						intStackSlice++;
					}
				}
				var intFirstX = 0;
				var intFirstY = 0;
				var intLastX = 0;
				var intLastY = 0;
				
				for(var xCount=0;xCount<arrX.length;xCount++) {
					//draw the first node
					
					if (xCount == 0) {

						var start = [];
						var end = [];
						intFirstX = arrX[xCount];
						intFirstY = arrY[xCount];
						intLastX = arrX[xCount];
						intLastY = arrY[xCount];
						this.workingNode = 1;
						this.workingRegion = intRID;
						var newPoly = new Zotero.AXE_polygon(this,intRID);
						this.polygons.push(newPoly);
						this.curPolygon = this.polygons.length-1;
						this.polygons[this.curPolygon].addNode(arrX[xCount], arrY[xCount], 0, this.workingRegion, this.workingNode, start, end);
						this.drawingState=true;				
								
					//draw the last node
					} else if (xCount == (arrX.length -1)) {
					
						this.curPolygon = this.polygons.length-1;
						var lstart = {posX:parseInt(intLastX),posY:parseInt(intLastY)};
						var lend = {posX:parseInt(arrX[xCount]),posY:parseInt(arrY[xCount])};
						this.workingNode = xCount + 1;
						var num = xCount;
						this.polygons[this.curPolygon].addNode(arrX[xCount], arrY[xCount], num, this.workingRegion, this.workingNode, lstart, lend);
						this.drawingState=false;
						var poly = this.polygons[this.curPolygon];
						poly.completed = true;
						var start = poly.nodes[poly.nodes.length-1];
						var end = poly.nodes[0];
						end.enterLine = this.drawLine({x:parseInt(arrX[xCount]),y:parseInt(arrY[xCount])},{x:parseInt(intFirstX),y:parseInt(intFirstY)});
						start.exitLine = end.enterLine;

					//draw an in-between node
					} else {
						this.curPolygon = this.polygons.length-1;
						//alert("Drawing In-Between Node");
						var start = {posX:parseInt(intLastX),posY:parseInt(intLastY)};
						var end = {posX:parseInt(arrX[xCount]),posY:parseInt(arrY[xCount])};
						this.workingNode = xCount + 1;
						var num = xCount;
						this.polygons[this.curPolygon].addNode(arrX[xCount], arrY[xCount], num, this.workingRegion, this.workingNode, start, end);
						intLastX = arrX[xCount];
						intLastY = arrY[xCount];

					}
					
				}				

			} else {
				alert("System cannot currently draw unrecognized regions");
			}
			
		
		
		}
		
	}

		
}

Zotero.AXEImage.prototype.zoomIn = function(){
if (this.clickMode == 1) {
	this.img.style.width = parseFloat(this.img.style.width) * 2;
	this.img.style.height = parseFloat(this.img.style.height) * 2;
	
	for (n in this.rectangles) {
		var rect = this.rectangles[n];
		rect.DOM.style.top = parseFloat(rect.DOM.style.top) * 2;
		rect.DOM.style.left = parseFloat(rect.DOM.style.left) * 2;
		rect.DOM.style.height = parseFloat(rect.DOM.style.height) * 2;
		rect.DOM.style.width = parseFloat(rect.DOM.style.width) * 2;
		rect.resizeOutline.style.top = parseFloat(rect.DOM.style.top) + parseFloat(rect.DOM.style.height) - 10;
		rect.resizeOutline.style.left = parseFloat(rect.DOM.style.left) + parseFloat(rect.DOM.style.width) - 10;
		rect.resizeOutline.style.height = 10;
		rect.resizeOutline.style.width = 10;
		
	}
	for (var p in this.polygons) {
		var poly = this.polygons[p];
		poly.clearLines();
		for (var n in poly.nodes) {
			var curnode = poly.nodes[n];
			
			curnode.DOM.style.top = parseFloat(curnode.DOM.style.top) * 2;
			curnode.DOM.style.left = parseFloat(curnode.DOM.style.left) * 2;
			curnode.img.deleteLine(curnode.enterLine);
			
			var before = curnode.polygon.nodes[curnode.num - 1];
			var after = curnode.polygon.nodes[curnode.num + 1];
			
			if (!before) {
				before = curnode.polygon.nodes[curnode.polygon.nodes.length - 1];
			}
			if (before) {
			
				var start = {
					x: parseInt(before.DOM.style.left),
					y: parseInt(before.DOM.style.top)
				};
				var end = {
					x: parseInt(curnode.DOM.style.left),
					y: parseInt(curnode.DOM.style.top)
				};
				curnode.enterLine = curnode.img.drawLine(start, end);
				before.exitLine = curnode.enterLine;
				
			}
			if (curnode.exitLine) {
			
				if (curnode.exitLine.length > 0) {
					curnode.img.deleteLine(curnode.exitLine);
					if (!after) {
						after = curnode.polygon.nodes[0];
						
						
						var last = {
							x: parseInt(after.DOM.style.left),
							y: parseInt(after.DOM.style.top)
						};
						curnode.exitLine = curnode.img.drawLine(end, last);
						after.enterLine = curnode.exitLine;
						
					}
				}
			}
		}
		//poly.redraw();
	}
	this.zoomLevel++;
}
}
Zotero.AXEImage.prototype.zoomOut = function(){
if (this.clickMode == 1) {
	this.img.style.width = parseFloat(this.img.style.width) / 2;
	this.img.style.height = parseFloat(this.img.style.height) / 2;
	
	for (n in this.rectangles) {
		rect = this.rectangles[n];
		rect.DOM.style.top = parseFloat(rect.DOM.style.top) / 2;
		rect.DOM.style.left = parseFloat(rect.DOM.style.left) / 2;
		rect.DOM.style.height = parseFloat(rect.DOM.style.height) / 2;
		rect.DOM.style.width = parseFloat(rect.DOM.style.width) / 2;
		rect.resizeOutline.style.top = parseFloat(rect.DOM.style.top) + parseFloat(rect.DOM.style.height) - 10;
		rect.resizeOutline.style.left = parseFloat(rect.DOM.style.left) + parseFloat(rect.DOM.style.width) - 10;
		rect.resizeOutline.style.height = 10;
		rect.resizeOutline.style.width = 10;
		
	}
	for (var p in this.polygons) {
		var poly = this.polygons[p];
		poly.clearLines();
		for (var n in poly.nodes) {
			var curnode = poly.nodes[n];
			
			curnode.DOM.style.top = parseFloat(curnode.DOM.style.top) / 2;
			curnode.DOM.style.left = parseFloat(curnode.DOM.style.left) / 2;
			curnode.img.deleteLine(curnode.enterLine);
			
			var before = curnode.polygon.nodes[curnode.num - 1];
			var after = curnode.polygon.nodes[curnode.num + 1];
			
			if (!before) {
				before = curnode.polygon.nodes[curnode.polygon.nodes.length - 1];
			}
			if (before) {
			
				var start = {
					x: parseInt(before.DOM.style.left),
					y: parseInt(before.DOM.style.top)
				};
				var end = {
					x: parseInt(curnode.DOM.style.left),
					y: parseInt(curnode.DOM.style.top)
				};
				curnode.enterLine = curnode.img.drawLine(start, end);
				before.exitLine = curnode.enterLine;
				
			}
			if (curnode.exitLine) {
			
				if (curnode.exitLine.length > 0) {
					curnode.img.deleteLine(curnode.exitLine);
					if (!after) {
						after = curnode.polygon.nodes[0];
						
						
						var last = {
							x: parseInt(after.DOM.style.left),
							y: parseInt(after.DOM.style.top)
						};
						curnode.exitLine = curnode.img.drawLine(end, last);
						after.enterLine = curnode.exitLine;
						
					}
				}
			}
		}
		//poly.redraw();
	}
	this.zoomLevel--;
}
}
Zotero.AXEImage.prototype.clickForNode = function(e){
	
	var me = this;
	var axePolyDBObj = new Zotero.AXEdb();
	
	switch(this.clickMode){
		case 1:

			//a polygon region has been started, so create a note for it and an associated Region ID
			var text = 'New Polygon';
			var intRegionType = 2;
			text = Zotero.Utilities.prototype.trim(text);
			var item = new Zotero.Item('note');
			item.setNote(text);
			var sqlParent = "SELECT itemAttachments.sourceItemID FROM itemAttachments WHERE itemAttachments.itemID = '"+this.itemID+"'";
			var parentID = Zotero.DB.valueQuery(sqlParent, "");
			item.setSource(parentID);
			var noteID = item.save();
			var intRegionID = axePolyDBObj.saveRegionItem(noteID, intRegionType);
			this.workingNode = 1;
			this.workingRegion = intRegionID;
			var newPoly = new Zotero.AXE_polygon(this,intRegionID);
			
			
			
			this.polygons.push(newPoly);
			this.curPolygon = this.polygons.length-1;
			this.clickMode = 2;
			var strEX = e.pageX;
			var strYX = e.pageY;
			var start = [];
			var end = [];
			
			this.polygons[this.curPolygon].addNode(strEX, strYX, 0, this.workingRegion, this.workingNode, start, end);
			this.drawingState=true;
			
		break;
		case 2:
		// Add a new node to the polygon
			//this.curPolygon = this.polygons.length-1;
			var strEX = e.pageX;
			var strYX = e.pageY;
			var poly = this.polygons[this.curPolygon];
			var start = poly.nodes[poly.nodes.length-1];
			var end = {posX:strEX,posY:strYX};
		
			this.workingNode++
			var num = this.polygons[this.curPolygon].nodes.length;
			this.polygons[this.curPolygon].addNode(strEX, strYX, num, this.workingRegion, this.workingNode, start, end);
			
		break;
		case 3:
		// Complete the polygon
			//this.curPolygon = this.polygons.length-1;
			var poly = this.polygons[this.curPolygon];
			var start = poly.nodes[poly.nodes.length-1];
			var end = poly.nodes[0];
			
			poly.completed = true;
			end.enterLine = this.drawLine({x:start.posX,y:start.posY},{x:end.posX,y:end.posY});
			//this.drawLine({x:lstart.posX,y:lstart.posY},{x:lend.posX,y:lend.posY});
			start.exitLine = end.enterLine;
			me.recordPolygon(this.workingRegion, this.polygons[this.curPolygon]);
			this.drawingState=false;
			
			
		break;
		case 4:
		//move or delete an existing node
		
		
		
		break;
		default:
		alert("default");
		break;
		
	}

	
	
		 // 0 = do nothing, 
						 // 1 = draw first node for polygon 
						 // 2 = draw another node on polygon
						 // 3 = draw rectangle
}


	//alert("e.pageX: "+e.pageX);
Zotero.AXEImage.prototype.deleteLine=function(line){
	if (line) {
		for (var n = 0; n < line.length; n++) {
			if (line[n].parentNode) {
				line[n].parentNode.removeChild(line[n]);
			}
		}
	}
	return;
}
Zotero.AXEImage.prototype.recordPolygon=function(intRegionID, objPoly){
	// Record the polygon from this.nodeArray;
	//alert('recorded');
	
	var arrPolyNodes = objPoly.nodes;
	//alert("Size of Nodes Array for this Poly: "+arrPolyNodes.length);
	//alert("RegionID: "+intRegionID);
	
	var arrRegionMap = new Array(); //holds collection of point info arrays
	var arrRegionFields = new Array(); //holds field type ID for the given point
	var arrRegionValues = new Array(); //holds point value for the given point
	var arrRegionOrder = new Array(); //holds order value for the given point
	
	var intSlice = 0;
	
	for(var rliCount=0;rliCount<arrPolyNodes.length;rliCount++) {
		var evntNode = arrPolyNodes[rliCount];
		//alert("evntNodeX: "+evntNode.posX);
		
			var factor = 2*this.zoomLevel;
	if (factor==0){
		factor =1;
	}
	else if (factor>0){
		factor = 1/factor;
	}
	else{
		factor = (Math.abs(factor));
	}
	
	//create a new NOTE item on this image item and then associate
	//coordinates of rectangle with the note

		arrRegionFields[intSlice] = 1;
		arrRegionValues[intSlice] = parseInt(parseFloat(evntNode.posX)*factor);
		arrRegionOrder[intSlice] = rliCount+1;
		intSlice++;
		arrRegionFields[intSlice] = 2;
		arrRegionValues[intSlice] = parseInt(parseFloat(evntNode.posY)*factor);
		arrRegionOrder[intSlice] = rliCount+1;		
		intSlice++;	
	}
	
	arrRegionMap[0] = arrRegionFields;
	arrRegionMap[1] = arrRegionValues;
	arrRegionMap[2] = arrRegionOrder;
	
	var intRegionID = this.workingRegion;
	
	//write region coordinate info to db
	var axePgWriteDBObj = new Zotero.AXEdb();
	axePgWriteDBObj.saveRegionPoints(intRegionID, arrRegionMap);
	
	this.nodeArray = [];
	this.clickMode=1;
	this.Zotero_Browser.toggleMode(null);
	
	//alert('recorded');
}

Zotero.AXEImage.prototype.createRectangle = function(e){
	this.regionType=1;
	var factor = 2*this.zoomLevel;
	if (factor==0){
		factor =1;
	}
	else if (factor>0){
		factor = 1/factor;
	}
	else{
		factor = (Math.abs(factor));
	}
	
	//create a new NOTE item on this image item and then associate
	//coordinates of rectangle with the note
	var startX = parseFloat(e.pageX)*factor;
	var startY = parseFloat(e.pageY)*factor;
	var newX = startX+(factor*100);
	var newY = startY+(factor*100);
	
	// NOTE:  RIGHT NOW THE COORDINATES FOR THE X/Y POINTS THAT ARE BEING STORED IN DATABSE
	// ARE ACTUALLY RELATIVE TO THE PAGE  AND NOT TO THE IMAGE.  NEED TO ADD CALCULATIONS
	// TO DETERMINE IMAGE PIXIL POSITION AS RELATED TO PAGE POSITION AND MODIFY VALUES OF
	// startX, startY, newX, and newY accordingly
	
	var text = 'Rectangular Region: x='+startX+'/y='+startY+', x='+newX.toString()+'/y='+newY.toString();
	text = Zotero.Utilities.prototype.trim(text);
	var item = new Zotero.Item('note');
	item.setNote(text);
	//not sure why -1 works here, but it does
	var sqlParent = "SELECT itemAttachments.sourceItemID FROM itemAttachments WHERE itemAttachments.itemID = '"+this.itemID+"'";
	var parentID = Zotero.DB.valueQuery(sqlParent, "");
	item.setSource(parentID);
	var noteID = item.save();
	
	//alert("noteID: "+noteID);
	
	//now I have a note ID I can save the associated region info
	
	//declare variables needed to call region insert function 
	var arrRegionMap = new Array();  //master array which packages data arrays
	var arrRegionFields = new Array(); //holds field type ID for the given point
	var arrRegionValues = new Array(); //holds point value for the given point
	var arrRegionOrder = new Array(); //holds order value for the given point
	var intRegionType; //type ID of region
	var intItemID; //the item ID of the note item that this region is associated with.
	
	//seed variable values
	arrRegionFields[0] = 1; // X
	arrRegionFields[1] = 2; // Y
	arrRegionFields[2] = 1; // X
	arrRegionFields[3] = 2;	// Y
	
	arrRegionValues[0] = startX;
	arrRegionValues[1] = startY;
	arrRegionValues[2] = newX;
	arrRegionValues[3] = newY;
	
	arrRegionOrder[0] = 1;
	arrRegionOrder[1] = 1;
	arrRegionOrder[2] = 2;
	arrRegionOrder[3] = 2;
	
	arrRegionMap[0] = arrRegionFields;
	arrRegionMap[1] = arrRegionValues;
	arrRegionMap[2] = arrRegionOrder;
	
	intRegionType = 1;
	// ??????????????????????  CHECK THIS VALUE/VARIABLE.  THIS DOESN'T LOOK RIGHT
	intItemID = 1;
	
	//write region coordinate info to db
	var axeDBObj = new Zotero.AXEdb();
	var intRegionID = axeDBObj.saveRegionItem(noteID, intRegionType);
	axeDBObj.saveRegionPoints(intRegionID, arrRegionMap);
	
	//draw rectangle
	this.Zotero_Browser.toggleMode(null);
	var newRect = new Zotero.AXE_rectangle(this,intRegionID,e.pageX,e.pageY,e.pageX+100,e.pageY+100);
	this.DOM.parentNode.appendChild(newRect.DOM);
	this.DOM.parentNode.appendChild(newRect.resizeOutline);
	this.rectangles.push(newRect);



}
Zotero.AXEImage.prototype.drawDot=function(x,y){
	var dot = this.document.createElement("div");

	dot.style.top = y;
	dot.style.left = x;
	dot.style.height = "2px";
	dot.style.width = "2px";
	dot.style.position = "absolute";
	dot.style.display = "block";
	dot.style.backgroundColor="yellow";
	this.DOM.appendChild(dot);
	return dot;
}
Zotero.AXEImage.prototype.drawLine=function(first,second,dotArray){
// Because the object is passed by reference, we need to make a working copy
  //alert(first.x+","+first.y+" to "+second.x+","+second.y);
  start = {x: first.x,y:first.y};
  end = {x: second.x,y:second.y};
  var dotArray = []; 	
  limit=1;
//This function is modified from code at http://ajaxphp.packtpub.com/ajax/whiteboard/
  
  var dy = end.y - start.y;
  var dx = end.x - start.x;
  
 // //alert("dy: "+dy);
 // //alert("dx: "+dx);

  var stepx, stepy, limit;
  if (dy < 0) 
  {
    dy = -dy;
    stepy = -1;
  }
  else
  {
    stepy = 1; 
  }
  if (dx < 0) 
  {
    dx = -dx;  
    stepx = -1; 
  }
  else 
  {
    stepx = 1; 
  }
  if (limit < 0 || limit == null) {
  	limit = (Math.ceil((dy / 100)))*2;
  }
 
  dy <<= 1; 
  dx <<= 1; 
  dot = this.drawDot(start.x,start.y);
  dotArray.push(dot);
// this.dotArray.push(dot);

  if (dx > dy) 
  {
  	//alert("Im in this loop dx > dy");
    fraction = dy - (dx >> 1); 
	dcount=0;
    while (start.x != end.x)
    {
    	////alert("start.x: "+start.x+" / end.x: "+end.x);
      if (fraction >= 0) 
      {
        start.y += stepy;
        fraction -= dx;
      }
      start.x += stepx;
      fraction += dy;
  if (dcount == limit) {
  
  	dotArray.push(this.drawDot(start.x,start.y));
	//this.dotArray.push(dot);
	dcount = 0;
  }
  else {
  	dcount++;
  }
  
        
    }
	
  }
  else
  {
  	//alert("otherwise");
    fraction = dx - (dy >> 1);
	dcount = 0;
    while (start.y != end.y) 
    {
      if (fraction >= 0) 
      {
        start.x += stepx;
        fraction -= dy;
      }      
      start.y += stepy;
      fraction += dx;
      if (dcount == limit) {
	
  	dotArray.push(this.drawDot(start.x,start.y));
	
	//this.dotArray.push(dot);
	dcount = 0;
  }
  else {
  	dcount++;
  }

    }
  }
  
  return dotArray;
}


Zotero.AXE_rectangle=function(img, regionID, left, top, right, bottom){
	var me = this;
	
		this.Zotero_Browser = img.Zotero_Browser;
	this.browser = img.browser;
	this.document = img.document;
	this.dragging = false;
	this.window = img.window;
	this.itemID=img.itemID;
	this.img = img; // tagged AXEImage object
	this.coords = [top, left, bottom, right]; // array of nodes outlining polygon 
	this.noteRef = null; // href to note
	this.resizeOutline = img.document.createElement("div");
	this.resizeOutline.className ="resize";
	
	this.DOM = img.document.createElement("div");
	this.DOM.className="AXERectangle";
	this.DOM.id = regionID;
	////alert("DOM ID: "+this.DOM.id);
	
	this.DOM.style.top = top+"px";	
	this.DOM.style.left = left+"px";	
	this.DOM.style.height = parseInt(bottom)-parseInt(top)+"px";	
	this.DOM.style.width = parseInt(right)-parseInt(left)+"px";

	this.DOM.style.border = "thin solid red";
	this.DOM.style.position = "absolute";
	this.DOM.style.display = "block";
	
	this.DOM.style.zIndex=9;
		this.resizeOutline.style.position = "absolute";
	this.resizeOutline.style.display = "block";
	this.resizeOutline.style.border = "thin solid black";
	this.resizeOutline.style.top = parseInt(top)+parseInt(this.DOM.style.height)-10;
	this.resizeOutline.style.left = parseInt(left)+parseInt(this.DOM.style.width)-10;
	this.resizeOutline.style.height = "10px";
	this.resizeOutline.style.width = "10px";
	this.resizeOutline.style.zIndex=10;
	
	this.resizeOutline.addEventListener("mousedown",function(e){
		
			//me._startMove(e,true)
			_startMove(e,me.document,me,me.resizeOutline,true)
	},false);
	this.DOM.addEventListener("mousedown",function(e){
		_startMove(e,me.document,me,me.DOM,false)
		//me._startMove(e,false);

	},true);

	
}

Zotero.AXE_rectangle.prototype.update = function(){
	////alert("this.DOM.id: "+this.DOM.id);
	this.updateRectangleShift();
}
Zotero.AXE_rectangle.prototype.updateRectangleShift = function() {
	////alert('updating');
	//declare variables needed to call region insert function 
	var arrRegionMap = new Array();  //master array which packages data arrays
	var arrRegionFields = new Array(); //holds field type ID for the given point
	var arrRegionValues = new Array(); //holds point value for the given point
	var arrRegionOrder = new Array(); //holds order value for the given point
	var strTop = this.DOM.style.top;
	var strLeft = this.DOM.style.left;
	var strHeight = this.DOM.style.height;
	var strWidth = this.DOM.style.width;
	
	
	//get rid of "px" on values
	/*
	//Unnecessary.  parseFloat kills px.
	 
	strTop = strTop.replace("px", "");
	strLeft = strLeft.replace("px", "");
	strHeight = strHeight.replace("px", "");
	strWidth = strWidth.replace("px", "");
	*/
	var factor = 2*this.img.zoomLevel;
	if (factor==0){
		factor =1;
	}
	else if (factor>0){
		factor = 1/factor;
	}
	else{
		factor = (Math.abs(factor));
	}
	//alert(this.img.zoomLevel+" * 2="+factor);
	//create a new NOTE item on this image item and then associate
	//coordinates of rectangle with the note

	
	
	
	//seed variable values
	arrRegionFields[0] = 1; // X
	arrRegionFields[1] = 2; // Y
	arrRegionFields[2] = 1; // X
	arrRegionFields[3] = 2;	// Y
	
	arrRegionValues[0] = parseFloat(strLeft)*factor;
	arrRegionValues[1] = parseFloat(strTop)*factor;
	arrRegionValues[2] = (parseFloat(strWidth)*factor)+arrRegionValues[0];
	arrRegionValues[3] = (parseFloat(strHeight)*factor)+arrRegionValues[1];
	
	arrRegionOrder[0] = 1;
	arrRegionOrder[1] = 1;
	arrRegionOrder[2] = 2;
	arrRegionOrder[3] = 2;
	
	arrRegionMap[0] = arrRegionFields;
	arrRegionMap[1] = arrRegionValues;
	arrRegionMap[2] = arrRegionOrder;	
	
	//write region coordinate info to db
	var axeUpdateDBObj = new Zotero.AXEdb();
	axeUpdateDBObj.deleteRegionPoints(this.DOM.id);
	axeUpdateDBObj.saveRegionPoints(this.DOM.id, arrRegionMap);
	
}


/***********
 * AXE_node
 * @param {Object} img
 * @param {Object} posX
 * @param {Object} posY
 * @param {Object} num
 * @param {Object} intRegionID
 * @param {Object} intNodeNumber
 */
Zotero.AXE_node = function(img, posX, posY, polygon, num, intRegionID, intNodeNumber){
	// A node in a polygon, created a position posX,posY within a 
	// parent node (parentNode)	
	
	var me = this;
	this.num = num;
	this.img = img;
	this.polygon = polygon;
	this.Zotero_Browser = img.Zotero_Browser;
	this.browser = img.browser;
	this.document = this.browser.contentDocument;
	this.window = this.browser.contentWindow;
	this.itemID = img.itemID;
	this.enterLine = [];
	this.exitLine = [];
	this.posX = posX;
	this.posY = posY;
	this.clickBehavior = 1; // 0 = do nothing
	// 1 = select to move
	// 2 = draw polygon;
	// 3 = remove 
	
	this.DOM = this.document.createElement("a");
	this.DOM.id = intRegionID + "_" + intNodeNumber;
	
	this.DOM.style.top = posY;
	this.DOM.style.left = posX;

	this.DOM.style.position = "absolute";
	this.DOM.style.display = "block";
	
	if (num == 0) {
		this.DOM.className = "firstNode";
	
		
		this.DOM.addEventListener("mouseover", function(e){
			me.DOM.style.top=parseInt(me.DOM.style.top)-3;
				me.DOM.style.left=parseInt(me.DOM.style.left)-3;
			me.img.clickMode = 3;
		}, false);
		this.DOM.addEventListener("mouseout", function(e){
			me.DOM.style.top=parseInt(me.DOM.style.top)+3;
			me.DOM.style.left=parseInt(me.DOM.style.left)+3;
			if (me.img.drawingState) {
				
				me.img.clickMode = 2;
			}
			else{
				
				me.img.clickMode=1;
			}
		}, false);
	}
	else {
	
		this.DOM.className = "node";
	
		this.DOM.addEventListener("mouseover", function(e){
					me.DOM.style.top=parseInt(me.DOM.style.top)-3;
				me.DOM.style.left=parseInt(me.DOM.style.left)-3;
			if (me.img.clickMode != 5) {
				me.img.clickMode = 4;
			}
			
		}, false);
		this.DOM.addEventListener("mouseout", function(e){
			me.DOM.style.top=parseInt(me.DOM.style.top)+3;
			me.DOM.style.left=parseInt(me.DOM.style.left)+3;
		
			if (me.img.drawingState) {
			
				me.img.clickMode = 2;
			}
			else{
			
				me.img.clickMode=1;
			}
		}, false);
		this.DOM.addEventListener("mousedown", function moveStart(e){
			me.img.clickMode = 5;
			me.Zotero_Browser.toggleMode(null);
			_startMove(e, me.document, me, me.DOM, false);
		}, true);
	
	
}
					   
}


Zotero.AXE_node.prototype.update=function(){
		//alert("This is where Node Updates Happen");

		//this.img.clickMode=2;
		this.posX = parseInt(this.DOM.style.left);
		this.posY = parseInt(this.DOM.style.top);
		
		
		////put code here to go to databse and re-write the posx, posy values for this node.
		var axePgWriteDBObj = new Zotero.AXEdb();
		var arrDOMInfo = this.DOM.id.split("_");
		//delete current records for this region number
		axePgWriteDBObj.deleteRegionPoints(arrDOMInfo[0]);
		//rebuild the region node data
		var arrPolyNodes = this.polygon.nodes;
		var arrRegionMap = new Array(); //holds collection of point info arrays
		var arrRegionFields = new Array(); //holds field type ID for the given point
		var arrRegionValues = new Array(); //holds point value for the given point
		var arrRegionOrder = new Array(); //holds order value for the given point
		
		var intSlice = 0;
		
		for(var rliCount=0;rliCount<arrPolyNodes.length;rliCount++) {
			if (rliCount == this.num) {

				arrRegionFields[intSlice] = 1;
				arrRegionValues[intSlice] = this.posX;
				arrRegionOrder[intSlice] = rliCount+1;
				intSlice++;
				arrRegionFields[intSlice] = 2;
				arrRegionValues[intSlice] = this.posY;
				arrRegionOrder[intSlice] = rliCount+1;		
				intSlice++;	
				
			
			} else {
			
			
				var evntNode = arrPolyNodes[rliCount];
				//alert("evntNodeX: "+evntNode.posX);
				
				arrRegionFields[intSlice] = 1;
				arrRegionValues[intSlice] = evntNode.posX;
				arrRegionOrder[intSlice] = rliCount+1;
				intSlice++;
				arrRegionFields[intSlice] = 2;
				arrRegionValues[intSlice] = evntNode.posY;
				arrRegionOrder[intSlice] = rliCount+1;		
				intSlice++;	
			
			}
		}
		
		arrRegionMap[0] = arrRegionFields;
		arrRegionMap[1] = arrRegionValues;
		arrRegionMap[2] = arrRegionOrder;
		
		var intRegionID = arrDOMInfo[0];
		
		//write region coordinate info to db
		axePgWriteDBObj.saveRegionPoints(intRegionID, arrRegionMap);
		this.img.deleteLine(this.enterLine);
		
		var before = this.polygon.nodes[this.num-1];
		var after = this.polygon.nodes[this.num+1];
	
		if (!before) {
			before = this.polygon.nodes[this.polygon.nodes.length-1];
		}
		if (before){
			
			var start = {x:parseInt(before.DOM.style.left),y:parseInt(before.DOM.style.top)};
			var end = {x:parseInt(this.polygon.nodes[this.num].DOM.style.left),y:parseInt(this.polygon.nodes[this.num].DOM.style.top)};
			this.enterLine = this.img.drawLine(start,end);
			before.exitLine = this.enterLine;
		
		}
		if (this.exitLine) {
		
			if (this.exitLine.length > 0) {
				this.img.deleteLine(this.exitLine);
				if (!after) {
					after = this.polygon.nodes[0];
				}
				if (after) {
				
					var last = {
						x: parseInt(after.DOM.style.left),
						y: parseInt(after.DOM.style.top)
					};
					this.exitLine = this.img.drawLine(end, last);
					after.enterLine = this.exitLine;
				
				}
			}
		}
		if (!(this.polygon.completed)) {
			
			// If the polygon isn't yet complete, go back to node making.
			this.img.Zotero_Browser.toggleMode("zotero-annotate-image-tb-polygon", true);
			
			this.img.clickMode = 2;
		}
		 			
			
				
}

Zotero.AXE_polygon=function(img,noteRef){
	this.img = img; // tagged AXEImage object
	this.nodes = []; // array of nodes outlining polygon 
	this.noteRef = noteRef; // href to note	
	this.completed=false;
}
Zotero.AXE_polygon.prototype.addNode=function(strX, strY, num, intWorkingRegion, intWorkingNode, objStart, objEnd){

	var newNode = new Zotero.AXE_node(this.img,strX,strY,this,num, intWorkingRegion, intWorkingNode);
	
	this.nodes.push(newNode);
	
	if (num>0){
		
		var intStartX = objStart.posX;
		var intStartY = objStart.posY;
		var intEndX = objEnd.posX;
		var intEndY = objEnd.posY

		var start = this.nodes[this.nodes.length-2];
		var end = this.nodes[this.nodes.length-1];
		newNode.enterLine = this.img.drawLine({x:intStartX,y:intStartY},{x:intEndX,y:intEndY});
		start.exitLine = newNode.enterLine;
	}
	this.img.DOM.parentNode.appendChild(newNode.DOM);
	this.workingNode++;
	return newNode;

}

Zotero.AXE_polygon.prototype.clearLines=function(){
	var nodes = this.nodes;
	for (var n=0;n<nodes.length;n++){
		var curNode = nodes[n];
		if (curNode.exitLine) {
			this.img.deleteLine(curNode.exitLine);
		}
	}
}
Zotero.AXE_polygon.prototype.replaceNode=function(pos,newNode){
	// replace a node at position (pos) in the coords array with 
	// a new node (newNode)
}	
Zotero.AXE_polygon.prototype.removeNode=function(pos){
	// remove a node at position (pos) in the coords array and redraw
}	
Zotero.AXE_polygon.prototype.insertNodeBefore=function(newNode,pos){
	//insert a new node (newNode) a position (pos) and redraw
}

Zotero.AXE_polygon.prototype.remove=function(){
	// remove this polygon from the image
}
Zotero.AXE_polygon.prototype.hide=function(){
	// hide this polygon from the image, but retain all data
}
Zotero.AXE_polygon.prototype.show=function(){
	// show this polygon if hidden
}

Zotero.AXE_node.prototype.remove = function(parentNode,posX,posY){
	// delete node	
}
