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
	this.curPolygon = 0;
	this.workingRegion = "";
	this.workingNode = 0;
	this.drawingState = false;
	this.regionType=0;
				  
		
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
	
	this.img.style.width = parseInt(this.img.style.width) * 2;
	this.img.style.height = parseInt(this.img.style.height) * 2;
}
Zotero.AXEImage.prototype.zoomOut = function(){

	this.img.style.width = parseInt(this.img.style.width) / 2;
	this.img.style.height = parseInt(this.img.style.height) / 2;
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
		
		arrRegionFields[intSlice] = 1;
		arrRegionValues[intSlice] = evntNode.posX;
		arrRegionOrder[intSlice] = rliCount+1;
		intSlice++;
		arrRegionFields[intSlice] = 2;
		arrRegionValues[intSlice] = evntNode.posY;
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
	
	//create a new NOTE item on this image item and then associate
	//coordinates of rectangle with the note
	var startX = e.pageX;
	var startY = e.pageY
	var newX = e.pageX+100;
	var newY = e.pageY+100;
	
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
	//alert("first.x: "+first.x);
  start = {x: first.x,y:first.y};
  end = {x: second.x,y:second.y};
  var dotArray = []; 	
  limit=1;
//This function is modified from code at http://ajaxphp.packtpub.com/ajax/whiteboard/
  
  var dy = end.y - start.y;
  var dx = end.x - start.x;
  
 // alert("dy: "+dy);
 // alert("dx: "+dx);

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
    	//alert("start.x: "+start.x+" / end.x: "+end.x);
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
	//alert("DOM ID: "+this.DOM.id);
	
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
	//alert("this.DOM.id: "+this.DOM.id);
	this.updateRectangleShift();
}
Zotero.AXE_rectangle.prototype.updateRectangleShift = function() {
	//alert('updating');
	//declare variables needed to call region insert function 
	var arrRegionMap = new Array();  //master array which packages data arrays
	var arrRegionFields = new Array(); //holds field type ID for the given point
	var arrRegionValues = new Array(); //holds point value for the given point
	var arrRegionOrder = new Array(); //holds order value for the given point
	var strTop = this.DOM.style.top;
	var strLeft = this.DOM.style.left;
	var strHeight = this.DOM.style.width;
	var strWidth = this.DOM.style.height;
	
	
	//get rid of "px" on values
	strTop = strTop.replace("px", "");
	strLeft = strLeft.replace("px", "");
	strHeight = strHeight.replace("px", "");
	strWidth = strWidth.replace("px", "");
	
	//seed variable values
	arrRegionFields[0] = 1; // X
	arrRegionFields[1] = 2; // Y
	arrRegionFields[2] = 1; // X
	arrRegionFields[3] = 2;	// Y
	
	arrRegionValues[0] = strLeft;
	arrRegionValues[1] = strTop;
	arrRegionValues[2] = parseInt(strWidth)+parseInt(strLeft);
	arrRegionValues[3] = parseInt(strHeight)+parseInt(strTop);;
	
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
	
	this.DOM = this.document.createElement("div");
	this.DOM.id = intRegionID + "_" + intNodeNumber;
	
	this.DOM.style.top = posY;
	this.DOM.style.left = posX;
	this.DOM.style.height = "9px";
	this.DOM.style.width = "9px";
	this.DOM.style.position = "absolute";
	this.DOM.style.display = "block";
	
	if (num == 0) {
		this.DOM.className = "firstNode";
		this.DOM.style.backgroundColor = "blue";
		
		this.DOM.addEventListener("mouseover", function(e){
			me.img.clickMode = 3;
		}, false);
		this.DOM.addEventListener("mouseout", function(e){
			if (me.img.drawingState) {
				
				me.img.clickMode = 2;
			}
			else{
				
				me.img.clickMode=1;
			}
		}, false);
	}
	else {
	
		this.DOM.className = "firstNode";
		this.DOM.style.backgroundColor = "red";
		this.DOM.addEventListener("mouseover", function(e){
		
			if (me.img.clickMode != 5) {
				me.img.clickMode = 4;
			}
			
		}, false);
		this.DOM.addEventListener("mouseout", function(e){
		
		
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
			
			var start = {x:parseInt(before.posX),y:parseInt(before.posY)};
			var end = {x:parseInt(this.polygon.nodes[this.num].posX),y:parseInt(this.polygon.nodes[this.num].posY)};
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
						x: after.posX,
						y: after.posY
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

Zotero.AXE_polygon.prototype.redraw=function(){
	// redraws the polygon based on the arrays
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
Zotero.AXE_polygon.prototype.redraw=function(){
	// redraw the polygon;
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

	/*
	if (obj.firstChild) {
	
		zObj = obj.firstChild;
		newW = (parseInt(YAHOO.util.Dom.getStyle(zObj, "width")) * 2);
		
		newH = (parseInt(YAHOO.util.Dom.getStyle(zObj, "height")) * 2);
		
		YAHOO.util.Dom.setStyle(zObj, "width", newW + "px");
		YAHOO.util.Dom.setStyle(zObj, "height", newH + "px");
		
	}
	thing.image.scale += 2;
	//resize box elements
	for (b in thing.image.imageRegions) {
		box = thing.image.imageRegions[b];
		bimage = document.getElementById(thing.image.id);
		bimageW = parseInt(YAHOO.util.Dom.getStyle(bimage, "width"));
		bimageWOld = bimageW / 1.5;
		ratio = bimageW / bimageWOld;
		
		
		bW = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "width")) * 2);
		bH = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "height")) * 2);
		YAHOO.util.Dom.setStyle(box.HTML, "width", bW + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "height", bH + "px");
		bTop = YAHOO.util.Dom.getStyle(box.HTML, "top");
		bLeft = YAHOO.util.Dom.getStyle(box.HTML, "left");
		bTop = parseInt(bTop) * 2;
		bLeft = parseInt(bLeft) * 2;
		
		
		YAHOO.util.Dom.setStyle(box.HTML, "left", bLeft + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "top", bTop + "px");

	}
	
	
	node = null;
	line = null;
	//resize nodes
	for (n in thing.image.areas) {
		node = thing.image.areas[n];
		node.clearLines(node);

		lastDot = null;
		child = null;
for (f in node.nodes) {
			child = node.nodes[f];
			newx = (parseInt(child.dot.HTML.style.left) * thing.image.HTML.width) / ((thing.image.HTML.width) / 2);
			newx = parseInt(newx);
			newy = (parseInt(child.dot.HTML.style.top) * thing.image.HTML.height) / ((thing.image.HTML.height) / 2);
			newy = parseInt(newy);

			child.dot.HTML.style.left = newx + "px";
			child.dot.HTML.style.top = newy + "px";
			
			if (thing.image.scale > 6) {
				child.dot.x = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id));
				child.dot.y = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id));
			} else {
				child.dot.setX(YAHOO.util.Dom.getX(child.dot.HTML.id));
				child.dot.setY(YAHOO.util.Dom.getY(child.dot.HTML.id));
			}
		
		}
		
		node.completeShape(node);
	}
}	
axe.ImagePanel.prototype.zoomOut = function(e, thing){
	obj = thing.content.HTML;
	if (obj.firstChild) {
		zObj = obj.firstChild;
		newW = (parseInt(YAHOO.util.Dom.getStyle(zObj, "width")) / 2);
		
		newH = (parseInt(YAHOO.util.Dom.getStyle(zObj, "height")) / 2);
		
		YAHOO.util.Dom.setStyle(zObj, "width", newW + "px");
		YAHOO.util.Dom.setStyle(zObj, "height", newH + "px");
	}
	thing.image.scale -= 2;
	//resize box elements
	boxes = YAHOO.util.Dom.getElementsByClassName("box", "div");
	
	for (b in thing.image.imageRegions) {
		box = thing.image.imageRegions[b];
		bimage = document.getElementById(thing.image.id);
		bimageW = YAHOO.util.Dom.getStyle(bimage, "width");
		bimageWOld = bimageW / 2;
		
		bW = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "width")) / 2);
		bH = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "height")) / 2);
		YAHOO.util.Dom.setStyle(box.HTML, "width", bW + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "height", bH + "px");
		bTop = YAHOO.util.Dom.getStyle(box.HTML, "top");
		bLeft = YAHOO.util.Dom.getStyle(box.HTML, "left");
		bTop = parseInt(bTop) / 2;
		bLeft = parseInt(bLeft) / 2;
		
		YAHOO.util.Dom.setStyle(box.HTML, "left", bLeft + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "top", bTop + "px");

	}
	
	node = null;
	for (n in thing.image.areas) {
		node = thing.image.areas[n];

		node.clearLines(node);

		lastDot = null;
		child = null;
		
		for (f in node.nodes) {
			child = node.nodes[f];
			
			newx = (parseInt(child.dot.HTML.style.left) * thing.image.HTML.width) / ((thing.image.HTML.width) * 2);
			newx = parseInt(newx);
			newy = (parseInt(child.dot.HTML.style.top) * thing.image.HTML.height) / ((thing.image.HTML.height) * 2);
			newy = parseInt(newy);
			
			child.dot.HTML.style.left = newx + "px";
			child.dot.HTML.style.top = newy + "px";
			
			
			if (thing.image.scale > 6) {
				child.dot.x = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id)) + (thing.image.HTML.width * 2);
				child.dot.y = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id)) + (thing.image.HTML.height * 2);
			} else {
				child.dot.setX(YAHOO.util.Dom.getX(child.dot.HTML.id));
				child.dot.setY(YAHOO.util.Dom.getY(child.dot.HTML.id));
			}
			
			
		}
		node.completeShape(node);
	}
}

/*
var mouseX = 0;
var mouseY = 0;




var trueValue=function(value, scale){
	//reduce given value down to the base scale
	value = parseInt(value);
	
	if(scale >0) {
		return (value / scale);
	} else if (scale < 0) {
		return (value * Math.abs(scale));
	} else {
		return value;
	}
}

//----------Line-------------------
var line = function(image,x0,y0,x1,y1){
	
	this.x0 = x0;
	this.x1 = x1;
	this.y0 = y0;
	this.y1 = y1;
	this.dotArray = [];
	this.image=image;
	
}
line.prototype.remove=function(){
	if (this.dotArray) {
		for (i in this.dotArray) {
		
			this.dotArray[i].HTML.parentNode.removeChild(this.dotArray[i].HTML);
			
		}

	} 
}
line.prototype.hide=function() {
	for(i in this.dotArray) {
		YAHOO.util.Dom.setStyle(this.dotArray[i].HTML.id, "display", "none");
	}
}
line.prototype.drawLine = function(limit){
limit=2;
//This function is modified from code at http://ajaxphp.packtpub.com/ajax/whiteboard/
  
  var dy = this.y1 - this.y0;
  var dx = this.x1 - this.x0;

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
  dot = new axe.dot(this.image,[this.x0, this.y0, 10, 10]);
 this.dotArray.push(dot);

  if (dx > dy) 
  {
    fraction = dy - (dx >> 1); 
	dcount=0;
    while (this.x0 != this.x1)
    {
      if (fraction >= 0) 
      {
        this.y0 += stepy;
        fraction -= dx;
      }
      this.x0 += stepx;
      fraction += dy;
  if (dcount == limit) {
  
  	dot = new axe.dot(this.image, [this.x0, this.y0, 10, 10]);
	this.dotArray.push(dot);
	dcount = 0;
  }
  else {
  	dcount++;
  }
  

        
    }
  }
  else
  {
    fraction = dx - (dy >> 1);
	dcount = 0;
    while (this.y0 != this.y1) 
    {
      if (fraction >= 0) 
      {
        this.x0 += stepx;
        fraction -= dy;
      }      
      this.y0 += stepy;
      fraction += dx;
      if (dcount == limit) {
  	dot = new axe.dot(this.image, [this.x0, this.y0, 10, 10]);
	this.dotArray.push(dot);
	dcount = 0;
  }
  else {
  	dcount++;
  }

    }
  }
}

//------Image Tagger Function
function getCoords(image, mode, shape, arr) {
	if (shape == "box") {
		if (mode == "new") {
			
			cLeft = arr[0];
			cTop = arr[1];
			cWidth = arr[2];
			cHeight = arr[3];
			scale = image.scale;
			if (scale != 0) {
				//scale elements down to original height and width
				while (scale != 0) {
					//scale = (scale >0) ? scale - 2 : scale + 2;
					if (scale > 0) {
						scale -= 2;
						//alert(scale);
						cLeft /= 2;
						cTop /= 2;
						cWidth /= 2;
						cHeight /= 2;
					}
					else 
						if (scale < 0) {
							scale += 2;
							//alert(scale);
							cLeft *= 2;
							cTop *= 2;
							cWidth *= 2;
							cHeight *= 2;
						}
				}
			}
			coords = parseInt(cLeft) + "," + parseInt(cTop) + "," + parseInt(cWidth) + "," + parseInt(cHeight);

		}
		else 
			if (mode == "overwrite") {
				cLeft = arr[0];
				cTop = arr[1];
				cWidth = arr[2];
				cHeight = arr[3];
					
				coords = parseInt(cLeft) + "," + parseInt(cTop) + "," + parseInt(cWidth) + "," + parseInt(cHeight);
				
				
			}
	} else {
		if (mode == "new") {
			
			var coords = "";
			for (i in arr) {
				node = arr[i];
				coords += trueValue(node.dot.HTML.style.left, image.scale) + "," + trueValue(node.dot.HTML.style.top, image.scale) + "-";
				
			}
			//generate a random number between 1 and 1000
			dbID = Math.floor(Math.random() * 1000 + 1);
			coords += coords.substring(0, coords.length-1);
			
			var width = trueValue(image.HTML.width, image.scale);
			var height = trueValue(image.HTML.height, image.scale);
			
			params = '?coords='+coords+'&id='+dbID+'&width='
			+width+'&height='+height+'&type=poly';
			response = phpCall('./database/coords.php', params, 'GET');
				
			
			return coords;
			
		
		}
		else 
			if (mode == "overwrite") {
				coords = "";
				
				var coords = "";
				for (i in arr) {
					node = arr[i];
					coords += trueValue(node.dot.HTML.style.left, image.scale) + "," + trueValue(node.dot.HTML.style.top, image.scale) + "-";
				
				}
				
				return coords;
			
			}
	}
}

axe.workspace.prototype.startUpTagset = function(e, obj) {
	

	//Set up tagset
	
	
	createImage(obj);
	
	
	
}



axe.shapeDragged = new YAHOO.util.CustomEvent("shapeDragged");
axe.shapeMoved = new YAHOO.util.CustomEvent("shapeMoved");

//------tagArea
axe.tagArea = function(panel) {

	panel.desktop.objects[this.id] = this;
	
	this.HTML = document.createElement("div");
	this.HTML.className = "tagArea";
	
	
	this.textarea = document.createElement("textarea");
	
	this.textarea.rows = "5";
	this.textarea.columns = "30";
	this.textarea.name = "tagArea";
	
	
	this.format = document.createElement("select");
	this.format.name = "formatChoose";
	this.format.label = "_Output Format_";
	this.format.innerHTML = "<option onclick=\"setTag(panel, 'TEI')\" label=\"_Output Format_\">TEI</option>" + 
	"<option onclick=\"setTag(panel, 'HTML')\" label=\"_Output Format_\">HTML</option>";
	
	this.HTML.appendChild(this.textarea);
	this.HTML.appendChild(this.format);
	
	
}

axe.tagArea.prototype.createWin=function(tag, obj){
	fobject = document.createElement("div");
	fobject.id = YAHOO.util.Dom.generateId("fobject");
	fobject.className = "tagWin";
	handle = document.createElement("div");
	handle.style.right = "0px";
	handle.style.width="10px";
	handle.style.height="10px";
	handle.id = YAHOO.util.Dom.generateId("fobjecthandle");
	fobject.appendChild(handle);
	zobject = obj.tagArea.HTML;
	fobject.appendChild(zobject);
	
	dragTag = new YAHOO.util.DD(fobject.id);
	dragTag.setHandleElId(handle.id);
	closeButton = document.createElement("button");
	closeButton.style.width="100px";
	closeButton.style.height="10px";
	closeButton.type="submit";
	closeButton.value="Close";
	
	fobject.appendChild(closeButton);
	
	obj.HTML.parentNode.appendChild(fobject);
	YAHOO.util.Event.addListener(closeButton, "click", this.closeWin, fobject);
	
}

//--------Dot----------------
axe.dot = function(image,points){

		this.image = image;

	this.id = YAHOO.util.Dom.generateId(this,"dot");
	this.HTML = document.createElement("div");
	this.HTML.id = this.id;

	
	this.HTML.className = "dot";
	
	this.top = parseInt(points[1]) - YAHOO.util.Dom.getY(this.image.HTML);
	this.left = parseInt(points[0]) - YAHOO.util.Dom.getX(this.image.HTML);
	this.realTop = parseInt(points[1]) - YAHOO.util.Dom.getY(this.image.HTML.parentNode);
	this.realLeft = parseInt(points[0]) - YAHOO.util.Dom.getX(this.image.HTML.parentNode);

	this.setX(points[0]);
	this.setY(points[1]);

	this.HTML.style.top = this.top+"px";
	this.HTML.style.left = this.left+"px";

	this.HTML.style.display = "block";
	

	this.image.HTML.parentNode.appendChild(this.HTML);
	
}
axe.dot.prototype.setX=function(x){
	this.x = parseInt(x);
	//YAHOO.util.Dom.setStyle(this.HTML,"left",this.x-YAHOO.util.Dom.getX(this.image.HTML.parentNode));
}
axe.dot.prototype.setY=function(y){
	this.y = parseInt(y);
	}
//-----------Polygon--------------
axe.node = function(image,points,start){
	
	this.dot = new axe.dot(image,points);
	this.dot.HTML.className = "node";
	this.image = image;
	this.area = null;
	
	this.start=start;
	
	YAHOO.util.Event.addListener(this.dot.id,"mouseover",this.mouseOverHandler,this);
	YAHOO.util.Event.addListener(this.dot.id,"mouseout",this.mouseOutHandler,this);
	
	
		YAHOO.util.Event.onAvailable(this.dot.id, this.makeDraggable, this);

	


}

axe.node.prototype.makeDraggable = function(obj){
	draggable = new YAHOO.util.DD(this.id);
	
	draggable.onMouseDown = function(){
		obj.area.clearLines(obj.area);
		
	}
	
	draggable.onDrag = function(){
	
		obj.dot.setX(YAHOO.util.Dom.getX(obj.dot.HTML));
		obj.dot.setY(YAHOO.util.Dom.getY(obj.dot.HTML));
	}
	
	draggable.onMouseUp = function(){
	
		
		if (obj.start) {
		
			obj.area.completeShape(obj.area);
	
			
		}

	}
	

	
	
	if (desktop.objects[this.id]){
		
		desktop.objects[this.id].draggable = draggable;
		
	}
	
}
axe.node.prototype.dbCall=function(obj) {
	
				//lines active
				//update database
				var coords = "";
				for (i in obj.area.nodes) {
					node = obj.area.nodes[i];
					coords += trueValue(node.dot.HTML.style.left) + "," + trueValue(node.dot.HTML.style.top) + "-";
					
				}
				//generate a random number between 1 and 1000
				obj.area.dbID = Math.floor(Math.random() * 1000 + 1);
				coords += coords.substring(0, coords.length-1);
				
				var width = obj.image.trueValue(obj.image.HTML.width);
				var height = obj.image.trueValue(obj.image.HTML.height);
				params = '?coords='+coords+'&id='+obj.area.dbID+'&width='
				+width+'&height='+height+'&type=poly';
				response = phpCall('./database/coords.php', params, 'GET');
				
				coords = "";
			
}
axe.node.prototype.mouseOverHandler = function(e,obj){
	if (obj.dot.HTML.className == "firstNode") {
		
	 obj.dot.HTML.className = "selectedFirstNode";
	}
	else {
		obj.dot.HTML.className = "selectedNode";
	}
}
axe.node.prototype.mouseOutHandler = function(e,obj){
	if (obj.dot.HTML.className == "selectedFirstNode") {
		
	 obj.dot.HTML.className = "firstNode";
	}
	else {
		obj.dot.HTML.className = "node";
	}
}
axe.node.prototype.nodeClicked = function(e,obj){
	image = obj.image;
	lastDot = null;
	coords = [];
	area = obj.image.curArea;
	(image.dotArray) ? passArray=image.dotArray : passArray=false;
	
	if (obj.dot.HTML.className == "selectedFirstNode") {
	
		mainDrag = null;
		
		if (area.lines.length > 0) {
			//node lines already activated
			
			
		}
		else {
			area.nodes = image.dotArray;
			for (i in image.dotArray) {
			
				aNode = image.dotArray[i];
		
			
			if (lastDot) {
				line = new axe.line(image, lastDot.dot.x, lastDot.dot.y, aNode.dot.x, aNode.dot.y);
				
				line.drawLine(1);
				area.lines.push(line);
				obj.image.lines.push(line);
				//lineBresenham(image, lastDot.dot.x, lastDot.dot.y, aNode.dot.x, aNode.dot.y);	
			
			}
			
			coords.push(aNode.dot.x - YAHOO.util.Dom.getX(aNode.dot.HTML.parentNode.parentNode));
			coords.push(aNode.dot.y - YAHOO.util.Dom.getY(aNode.dot.HTML.parentNode.parentNode));
			lastDot = aNode;
			
			
		}
			
		line = new axe.line(image, lastDot.dot.x, lastDot.dot.y, image.dotArray[0].dot.x, image.dotArray[0].dot.y);
		line.drawLine(1);
			
		area.lines.push(line);
		obj.image.lines.push(line);
		
		
		coordString = "";
		
		for (c in coords) {
			coordString = coordString + coords[c] + ",";
		}
		
		area.HTML.coords = coordString.substring(0, coordString.length - 1);
		
		for(i in image.dotArray) {
			aNode = image.dotArray[i];
				
			//aNode.area.nodes.push(aNode);
			aNode.area = area;
			aNode.image = image;
			aNode.isetID = obj.isetID;
			
			YAHOO.util.Event.addListener(aNode.dot.HTML.id, "mouseup", this.dotDropped, aNode, true);
		}
		getCoords(image, 'new', 'poly', obj.area.nodes);
		
		//add to nodes array for image
		obj.image.nodes.push(area.nodes[0]);
		var arr = {top: area.nodes[0].dot.HTML.style.top, left: area.nodes[0].dot.HTML.style.left};
		
		obj.image.panel.sidePanel.refreshView(arr);
		//obj.image.panel.desktop.sideBar.add(arr, obj.image);
		
		image.dotArray = new Array();
		//database functions
		
		
		}
	} 
		
}

axe.area = function(image,type){
	this.id = YAHOO.util.Dom.generateId(this,"area");
	this.HTML = document.createElement("area");	
	this.HTML.id = this.id;
	this.image = image;
	//this.HTML.setAttribute("onclick","alert('hi')");
	this.HTML.shape = type;
	this.nodes = [];
	this.lines = [];
	this.xml = null;
	this.dbID = null;
	 
}
axe.area.prototype.clearLines=function(obj){
	for (i in obj.lines){
		obj.lines[i].remove();
	}
	obj.lines = [];
	obj.image.curArea = obj;
}
axe.area.prototype.completeShape=function(area){
	image = area.image;
	lastDot=null;
	
	var y0, y1, x0, x1;
	
	for (i in area.nodes) {
			
			aNode = area.nodes[i];
			
			
			if (lastDot) {
				y0 = parseInt(YAHOO.util.Dom.getY(lastDot.dot.HTML));
				y1 = parseInt(YAHOO.util.Dom.getY(aNode.dot.HTML));
				x0 = parseInt(YAHOO.util.Dom.getX(lastDot.dot.HTML));
				x1 = parseInt(YAHOO.util.Dom.getX(aNode.dot.HTML));
			
				line = new axe.line(image, x0, y0, x1, y1);
				
				line.drawLine(5);
				area.lines.push(line);
				
			}
			
			lastDot = aNode;
			
			
		}
		y0 = parseInt(YAHOO.util.Dom.getY(lastDot.dot.HTML));
		y1 = parseInt(YAHOO.util.Dom.getY(area.nodes[0].dot.HTML));
		x0 = parseInt(YAHOO.util.Dom.getX(lastDot.dot.HTML));
		x1 = parseInt(YAHOO.util.Dom.getX(area.nodes[0].dot.HTML));	
		line = new axe.line(image, x0, y0, x1, y1);
		line.drawLine(5);		
		area.lines.push(line);
		area.image.curArea=null;
		
		//var randn = Math.floor(Math.random()*1000+1);
		//update database
		this.coords = getCoords(image, 'new', 'poly', area.nodes);
		var arr = (!area.dbID) ? {id: area.id, type: "poly", area: area, coords: this.coords} : {id: area.dbID, type: "poly", overwrite: true, area: area, coords: this.coords};
		if(!area.dbID) {
			area.xml = this.image.panel.addZone(area, this.coords);
			axe.tagCreated.fire({obj: area.xml});
		}
		area.image.panel.sidePanel.refreshView(arr);
		
		area.dbID = (area.dbID == null) ? area.id : area.dbID;
		
		
		
	
}
axe.imageRegion = function(image,points, id){

	this.image = image;
	this.dbID = null;
	this.id = (!id) ? YAHOO.util.Dom.generateId(this,"imageRegion") : id;
	this.HTML = document.createElement("div");
	this.HTML.id = this.id;
	this.area = new axe.area(this.image, "box");
	
	
	this.HTML.className = "box";
	top = parseInt(points[1])-parseInt(YAHOO.util.Dom.getY(this.image.HTML));
	left = parseInt(points[0])-parseInt(YAHOO.util.Dom.getX(this.image.HTML));
	
	realTop = top - this.image.HTML.parentNode.parentNode.firstChild.offsetHeight;
	
	this.HTML.style.top = top+"px";
	this.HTML.style.left = left+"px";
	this.HTML.style.height = points[2] + "px";
	this.HTML.style.width = points[3] + "px";
	this.HTML.style.display = "block";
	this.image.HTML.parentNode.appendChild(this.HTML);
	//Call Database

	coords = "";
	this.area.xml = this.image.panel.addZone(this.area, coords);
	
	obj = {id: this.id, type: "box", area: this.area, ulx: trueValue(this.HTML.style.left, this.image.scale), uly: trueValue(this.HTML.style.top, this.image.scale), lrx: trueValue(this.HTML.style.width, this.image.scale), lry: trueValue(this.HTML.style.height, this.image.scale)};
	this.image.panel.sidePanel.refreshView(obj);
	axe.tagCreated.fire({obj: this.area.xml});
	
	
	YAHOO.util.Event.onAvailable(this.HTML.id, this.handleOnAvailable, this, true);	
	YAHOO.util.Event.addListener(this.HTML.id, "mouseup", this.changed, this, true);
	image.imageRegions.push(this);
	
	
	//this.dbCall(this);
}
axe.imageRegion.prototype.changed = function(e, obj) {

	arr = {id: this.id, type: "box", overwrite: true, ulx: trueValue(this.HTML.style.left, this.image.scale), uly: trueValue(this.HTML.style.top, this.image.scale), lrx: trueValue(this.HTML.style.width, this.image.scale), lry: trueValue(this.HTML.style.height, this.image.scale)};
	this.image.panel.sidePanel.refreshView(arr);
	//this.image.panel.desktop.sideBar.add(obj, this.image);
	 
}
axe.imageRegion.prototype.dbCall=function(obj) {
	//update database
	var coords = "" + trueValue(obj.HTML.style.left, obj.image.scale) + "," + trueValue(obj.HTML.style.top, obj.image.scale) + "," + trueValue(obj.HTML.style.width, obj.image.scale) + "," + trueValue(obj.HTML.style.height, obj.image.scale);
	var height = trueValue(obj.image.HTML.height, obj.image.scale);
	var width = trueValue(obj.image.HTML.width, obj.image.scale);
	//generate a random number between 1 and 1000
	obj.dbID = Math.floor(Math.random() * 1000 + 1);
	params = '?coords='+coords+'&id='+obj.dbID+'&width='
				+width+'&height='+height+'&type=box';
	response = phpCall('./database/coords.php', params, 'GET');
			
}
axe.imageRegion.prototype.handleOnAvailable=function(){
	makeDragResize(this.HTML);
}
axe.imageRegion.prototype.getPoints = function(){
	
	return ([this.HTML.style.left,this.HTML.style.top,this.HTML.style.width,this.HTML.style.height]);
}
axe.imageRegion.prototype.handleOnAvailable = function(me){

	draggable = new YAHOO.util.DD(this.id);
	//draggable.setHandleElId(this.id+"_handle");
	
	// Yahoo code for making a resizable panel
	
	this.resize = new YAHOO.util.Resize(this.id, {
		handles: ['br'],
		
		autoRatio: false,
		minWidth: 10,
		minHeight: 10
	
	});
	
	
}
//--------------Image--------------------
axe.image = function(src,loc){
		
	this.id = YAHOO.util.Dom.generateId(this,"image");
	desktop = loc.desktop;
	
	desktop.objects[this.id] = this;
	
	//this.dotArray = new Array();
	this.curArea = null;
	this.leftDot=null;
	this.topDot=null;
	this.bottomDot=null;
	this.rightDot=null;
	this.src = src;
	this.HTML = document.createElement("img");
	this.HTML.src=src;
	this.HTML.id = this.id;
	this.areas=[];
	this.origWidth = this.HTML.width;
	this.origHeight = this.HTML.height;
	this.panel = loc;
	this.imageRegions = new Array(); //storing boxes
	this.nodes = new Array(); //storing polygons
	this.lines = new Array(); //storing line dots
	this.scale = 0;	
	YAHOO.util.Event.addListener(this.HTML, "click", this.imageClick, this);
	}

axe.image.prototype.change=function(src){
	
	this.HTML.src = src;
	this.src=src;

		
}
axe.image.prototype.trueValue=function(value) {
	//find the scaled up or scaled down value
	if(this.scale >0) {
		return (value / this.scale);
	} else if (this.scale < 0) {
		return (value / Math.abs(this.scale));
	} else {
		return value;
	}
}
axe.image.prototype.imageClick = function(e,args){
	
	if (args.panel.shapeType == "poly") {
		
		if (args.curArea) {
		aNode = new axe.node(args, [mouseX, mouseY, 10, 10],false);
			args.curArea.nodes.push(aNode);
		}
		else{
		aNode = new axe.node(args, [mouseX, mouseY, 10, 10],true);
			aNode.dot.HTML.className = "firstNode";
			args.curArea = new axe.area(args,"poly");
			args.curArea.nodes.push(aNode);
			args.areas.push(args.curArea);
			//YAHOO.util.Event.addListener(aNode,"mousedown",args.curArea.clearLines,args.curArea);
			
		}	
		//YAHOO.util.Event.addListener(aNode.dot.id,"mousedown",args.curArea.clearLines,args.curArea);
	
		aNode.area = args.curArea;
		
			
		
		
	}
	else if(args.panel.shapeType == "box") {
		box = new axe.imageRegion(args,[mouseX, mouseY, 10, 10]);
	
	}
}

axe.image.prototype.getCoordOnOrig = function(img,x,y){
	xCor = parseInt(x);
	yCor = parseInt(y);
	
	imgObj = desktop.objects[img.id];
	xPercent = xCor/parseInt(img.offsetWidth);
	yPercent = yCor/parseInt(img.offsetHeight);
	realX = Math.round(xPercent * parseInt(imgObj.origWidth));
	realY = Math.round(yPercent * parseInt(imgObj.origHeight));
	result = [realX,realY];
	
	return  result;
	
}
axe.image.prototype.getCoordOnCur = function (img,x,y){
		xCor = parseInt(x);
		yCor = parseInt(y);
		imgObj = desktop.objects[img.id];
	
		xPercent = xCor/imgObj.origWidth;
	yPercent = yCor/imgObj.origHeight;
	
	realX = Math.round(xPercent * parseInt(img.offsetWidth));
	realY = Math.round(yPercent * parseInt(img.offsetHeight));
	result = [realX,realY];
	
	return  result;
}

axe.xml = function(xmlSrc){
	this.src = xmlSrc;
	this.xml = loadXMLDoc(xmlSrc);
	
	
	
}

//----------------------
axe.mouseMoveEvent = function(e){
	mouseX = YAHOO.util.Event.getPageX(e);
	mouseY = YAHOO.util.Event.getPageY(e)
} 

YAHOO.util.Event.onDOMReady(function() {
		YAHOO.util.Event.addListener(document, "mousemove", axe.mouseMoveEvent);
		//desktop = new axe.workspace("workspace");
		
		//createWindow(desktop); 
});

makeDragResize = function(me){
	draggable = new YAHOO.util.DD(this.id);
	
	
	
	this.resize = new YAHOO.util.Resize(this.id, {
		handles: ['br','tl','tr','bl'],
		
		autoRatio: false,
		minWidth: 10,
		minHeight: 10
	
	});
	
	if (desktop.objects[this.id]){
		
		desktop.objects[this.id].draggable = draggable;
		
	}
}

axe.ImagePanel.prototype.drawBox = function(e,args){
	
	if(args.shapeType=="box") { //reclicking the button to turn off tagger
		args.shapeType = "off";
		desktop.objects[this.id].image.src = "images/icon_rectangle.png";
	} else {
		args.shapeType = "box";
		desktop.objects[this.id].image.src = "images/icon_rectangle_selected.png";
		desktop.objects[this.nextSibling.id].image.src = "images/icon_polygon.png";
	}
}

axe.ImagePanel.prototype.drawPoly = function(e,args){
	
	if (args.shapeType == "poly") { //reclicking the button to turn off tagger
		args.shapeType = "off";
		
		//desktop.objects[this.previousSibling.id].image.src = "images/icon_rectangle.png";
		desktop.objects[this.id].image.src = "images/icon_polygon.png";
	}
	else {
		args.shapeType = "poly";
		desktop.objects[this.previousSibling.id].image.src = "images/icon_rectangle.png";
		desktop.objects[this.id].image.src = "images/icon_polygon_selected.png";
	}
}
axe.ImagePanel.prototype.showPoly = function (e, obj, hide) {
	if(!(hide)) {
		//Show polygons
		for(i in this.image.dotArray) {
			dot = this.image.dotArray[i];
			dot.dot.HTML.style.display = "block";
		}
	} else {
		//hide polygons
	}
}
//-----------Coords----------------------
//retrieve boxes
axe.ImagePanel.prototype.getTags=function() {
	var response = phpCall('./database/retrievecoords.php', '', 'GET');
	if (response != "") {
	
		arr = response.split(';');
		for (x = 0; x < arr.length; x++) {
		
			temp = arr[x].split('-');
			if (temp[0] == 'box') {
				id = temp[0];
				coords = temp[1].split(',');
				
				ulx = coords[0];
				uly = coords[1];
				lrx = coords[2];
				lry = coords[3];
				
				box = new axe.imageRegion(this.image, [ulx, uly, lrx, lry], id);
			} else if(temp[0] == "poly") {
				id = temp[1];
				coords = temp[2].split(',');
				node = new Object();
				for(c=0;c<coords.length;c++) {
					p0 = parseInt(coords[c]) + parseInt(YAHOO.util.Dom.getX(this.image.HTML));
					p1 = parseInt(coords[++c]) + parseInt(YAHOO.util.Dom.getY(this.image.HTML));
					
					//startNode = (this.image.curArea != null) ? false : true;
					if (this.image.curArea) {
						node = new axe.node(this.image, [p0, p1, 10, 10], false);
						node.area = this.image.curArea;
						this.image.curArea.nodes.push(node);
					} else {
						node = new axe.node(this.image, [p0, p1, 10, 10], true);
						node.dot.HTML.className = "firstNode";
						this.image.curArea = new axe.area(this.image, "poly");
						this.image.curArea.nodes.push(node);
						this.image.areas.push(this.image.curArea);
						node.area = this.image.curArea;
					}
					
				}
				this.image.curArea.completeShape(this.image.curArea);
			}
		}
	}
}
//-----------Zoom----------------------
axe.ImagePanel.prototype.zoomIn = function(e, thing){
	obj = thing.content.HTML;
	if (obj.firstChild) {
	
		zObj = obj.firstChild;
		newW = (parseInt(YAHOO.util.Dom.getStyle(zObj, "width")) * 2);
		
		newH = (parseInt(YAHOO.util.Dom.getStyle(zObj, "height")) * 2);
		
		YAHOO.util.Dom.setStyle(zObj, "width", newW + "px");
		YAHOO.util.Dom.setStyle(zObj, "height", newH + "px");
		
	}
	thing.image.scale += 2;
	//resize box elements
	for (b in thing.image.imageRegions) {
		box = thing.image.imageRegions[b];
		bimage = document.getElementById(thing.image.id);
		bimageW = parseInt(YAHOO.util.Dom.getStyle(bimage, "width"));
		bimageWOld = bimageW / 1.5;
		ratio = bimageW / bimageWOld;
		
		
		bW = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "width")) * 2);
		bH = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "height")) * 2);
		YAHOO.util.Dom.setStyle(box.HTML, "width", bW + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "height", bH + "px");
		bTop = YAHOO.util.Dom.getStyle(box.HTML, "top");
		bLeft = YAHOO.util.Dom.getStyle(box.HTML, "left");
		bTop = parseInt(bTop) * 2;
		bLeft = parseInt(bLeft) * 2;
		
		
		YAHOO.util.Dom.setStyle(box.HTML, "left", bLeft + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "top", bTop + "px");

	}
	
	
	node = null;
	line = null;
	//resize nodes
	for (n in thing.image.areas) {
		node = thing.image.areas[n];
		node.clearLines(node);

		lastDot = null;
		child = null;
for (f in node.nodes) {
			child = node.nodes[f];
			newx = (parseInt(child.dot.HTML.style.left) * thing.image.HTML.width) / ((thing.image.HTML.width) / 2);
			newx = parseInt(newx);
			newy = (parseInt(child.dot.HTML.style.top) * thing.image.HTML.height) / ((thing.image.HTML.height) / 2);
			newy = parseInt(newy);

			child.dot.HTML.style.left = newx + "px";
			child.dot.HTML.style.top = newy + "px";
			
			if (thing.image.scale > 6) {
				child.dot.x = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id));
				child.dot.y = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id));
			} else {
				child.dot.setX(YAHOO.util.Dom.getX(child.dot.HTML.id));
				child.dot.setY(YAHOO.util.Dom.getY(child.dot.HTML.id));
			}
		
		}
		
		node.completeShape(node);
	}
}	
axe.ImagePanel.prototype.zoomOut = function(e, thing){
	obj = thing.content.HTML;
	if (obj.firstChild) {
		zObj = obj.firstChild;
		newW = (parseInt(YAHOO.util.Dom.getStyle(zObj, "width")) / 2);
		
		newH = (parseInt(YAHOO.util.Dom.getStyle(zObj, "height")) / 2);
		
		YAHOO.util.Dom.setStyle(zObj, "width", newW + "px");
		YAHOO.util.Dom.setStyle(zObj, "height", newH + "px");
	}
	thing.image.scale -= 2;
	//resize box elements
	boxes = YAHOO.util.Dom.getElementsByClassName("box", "div");
	
	for (b in thing.image.imageRegions) {
		box = thing.image.imageRegions[b];
		bimage = document.getElementById(thing.image.id);
		bimageW = YAHOO.util.Dom.getStyle(bimage, "width");
		bimageWOld = bimageW / 2;
		
		bW = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "width")) / 2);
		bH = (parseInt(YAHOO.util.Dom.getStyle(box.HTML, "height")) / 2);
		YAHOO.util.Dom.setStyle(box.HTML, "width", bW + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "height", bH + "px");
		bTop = YAHOO.util.Dom.getStyle(box.HTML, "top");
		bLeft = YAHOO.util.Dom.getStyle(box.HTML, "left");
		bTop = parseInt(bTop) / 2;
		bLeft = parseInt(bLeft) / 2;
		
		YAHOO.util.Dom.setStyle(box.HTML, "left", bLeft + "px");
		YAHOO.util.Dom.setStyle(box.HTML, "top", bTop + "px");

	}
	
	node = null;
	for (n in thing.image.areas) {
		node = thing.image.areas[n];

		node.clearLines(node);

		lastDot = null;
		child = null;
		
		for (f in node.nodes) {
			child = node.nodes[f];
			
			newx = (parseInt(child.dot.HTML.style.left) * thing.image.HTML.width) / ((thing.image.HTML.width) * 2);
			newx = parseInt(newx);
			newy = (parseInt(child.dot.HTML.style.top) * thing.image.HTML.height) / ((thing.image.HTML.height) * 2);
			newy = parseInt(newy);
			
			child.dot.HTML.style.left = newx + "px";
			child.dot.HTML.style.top = newy + "px";
			
			
			if (thing.image.scale > 6) {
				child.dot.x = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id)) + (thing.image.HTML.width * 2);
				child.dot.y = Math.abs(YAHOO.util.Dom.getX(child.dot.HTML.id)) + (thing.image.HTML.height * 2);
			} else {
				child.dot.setX(YAHOO.util.Dom.getX(child.dot.HTML.id));
				child.dot.setY(YAHOO.util.Dom.getY(child.dot.HTML.id));
			}
			
			
		}
		node.completeShape(node);
	}
}
axe.ImagePanel.prototype.addZone=function(area, coords){
	dom = this.DOM;
	zone = dom.createElement("zone");
	zone.setAttribute("xml:id", area.id);
	zone.setAttribute("coords", coords);
	dom.documentElement.appendChild(zone);
	
	return zone;
}




*/