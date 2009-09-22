Zotero.AXEImage= function(Zotero_Browser, browser, itemID){

	this.Zotero_Browser = Zotero_Browser;
	this.browser = browser;
	this.document = browser.contentDocument;
	this.window = browser.contentWindow;
	this.itemID=itemID;
	
	/*var jScriptTag = this.document.createElement("script");
	jScriptTag.src="chrome://zotero/content/jquery-1.3.2.min.js";
	jScriptTag.type="text/JavaScript";
	this.document.getElementsByTagName("head").item(0).appendChild(jScriptTag);
	jScriptTag = this.document.createElement("script");
	jScriptTag.src="chrome://zotero/content/jquery-ui-1.7.2.custom.min.js";
	jScriptTag.type="text/JavaScript";
	this.document.getElementsByTagName("head").item(0).appendChild(jScriptTag);
	*/
	this.scale=1;
	this.DOM = null;
	this.src = "";
	this.oHeight = 0;
	this.oWidth = 0;
	this.annotations = [];
	this.clickMode = 0;  // determines onClick behavior
						 // 0 = do nothing, 
						 // 1 = draw first node for polygon 


/*						 // 2 = draw another node on polygon
						 // 3 = draw rectangle
	//TEMP CODE TO CALL THE AXE REGION DB INSERT FUNCTION Zotero.AXEdb.saveRegion
	
	//declare variables needed to call region insert function 
	var arrRegionMap = new Array();  //master array which packages data arrays
	var arrRegionFields = new Array(); //holds field type ID for the given point
	var arrRegionValues = new Array(); //holds point value for the given point
	var arrRegionOrder = new Array(); //holds order value for the given point
	var intRegionType; //type ID of region
	var intItemID; //the item ID of the note item that this region is associated with.
	
	//artificically seed the variables.  This will need to be done in an
	//intelligent way by region drawing code.  This arbitrary seeding pass
	//values for a rectangle
	
	arrRegionFields[0] = 1; // X
	arrRegionFields[1] = 2; // Y
	arrRegionFields[2] = 1; // X
	arrRegionFields[3] = 2;	// Y
	
	arrRegionValues[0] = 5;
	arrRegionValues[1] = 25;
	arrRegionValues[2] = 72;
	arrRegionValues[3] = 55;
	
	arrRegionOrder[0] = 1;
	arrRegionOrder[1] = 1;
	arrRegionOrder[2] = 2;
	arrRegionOrder[3] = 2;
	
	arrRegionMap[0] = arrRegionFields;
	arrRegionMap[1] = arrRegionValues;
	arrRegionMap[2] = arrRegionOrder;
	
	intRegionType = 1;
	intItemID = 1;
	
	// END ARTIFICIALLY SEED VARIABLES SECTION
						 					 
	var axeDBObj = new Zotero.AXEdb();
	alert(axeDBObj);
	axeDBObj.saveRegion(intItemID, intRegionType, arrRegionMap);
	
	*/
						  
		
}
Zotero.AXEImage.prototype.loadImageFromPage = function(){
	
	var origSizeStr = this.document.title.toString();
	var strEnd = origSizeStr.indexOf(" pixels");
	var strBeg = origSizeStr.lastIndexOf(" ",strEnd-1);
	origSizeStr = origSizeStr.substring(strBeg,strEnd).split("x");

	
	var img = this.document.getElementsByTagName("img")[0];
	img.style.width=parseInt(origSizeStr[0])+"px";
	img.style.height=parseInt(origSizeStr[1])+"px";
	this.DOM = this.document.createElement("div");
	this.DOM.appendChild(img.cloneNode(true));
	var body = this.document.getElementsByTagName("body")[0];
	body.appendChild(this.DOM);
	
	body.style.cursor = "pointer";

	img.parentNode.removeChild(img);	
	img = this.DOM.firstChild;
		img.style.cursor = "pointer";
}

Zotero.AXEImage.prototype.zoomIn = function(){
	
	this.DOM.style.width = parseInt(this.DOM.style.width) * 2;
	this.DOM.style.height = parseInt(this.DOM.style.height) * 2;
}
Zotero.AXEImage.prototype.zoomOut = function(){

	this.DOM.style.width = parseInt(this.DOM.style.width) / 2;
	this.DOM.style.height = parseInt(this.DOM.style.height) / 2;
}
Zotero.AXEImage.prototype.createRectangle = function(e){

	//draw rectangle over image
	this.Zotero_Browser.toggleMode(null);
	var newRect = new Zotero.AXE_rectangle(this,e.pageX,e.pageY,e.pageX+100,e.pageY+100);
	this.DOM.parentNode.appendChild(newRect.DOM);
	this.DOM.parentNode.appendChild(newRect.resizeOutline);
	//this.DOM.parentNode.appendChild(this.document.createTextNode("Hello"));
	
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
	item.setSource(this.itemID-1);
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
	intItemID = 1;
	
	//write region coordinate info to db
	var axeDBObj = new Zotero.AXEdb();
	axeDBObj.saveRegion(noteID, intRegionType, arrRegionMap);

}

Zotero.AXE_rectangle=function(img, left, top, right, bottom){
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
	
	this.DOM.style.top = top+"px";	
	this.DOM.style.left = left+"px";	
	this.DOM.style.height = parseInt(bottom)-parseInt(top)+"px";	
	this.DOM.style.width = parseInt(right)-parseInt(left)+"px";
	this.rectX=left;
	this.rectY=top;
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
		
			me._startMove(e,true)
		
	},false);
	this.DOM.addEventListener("mousedown",function(e){

		me._startMove(e,false);

	},true);

	
}

/**
 * Called to begin moving the annotation
 *
 * @param {Event} e DOM event corresponding to click on the grippy
 * @private
 */
Zotero.AXE_rectangle.prototype._startMove = function(e,resizing) {
	// stop propagation
	e.stopPropagation();
	e.preventDefault();
	
	var body = this.document.getElementsByTagName("body")[0];
	var me = this;
	// set the handler required to deactivate
	
	/**
	 * Callback to end move action
	 * @inner
	 */
	
	
	/**
	 * Listener to handle mouse moves on main page
	 * @inner
	 */
	var handleMoveMouse1 = function(e) {
		if (resizing) {
			me.resizeBox(e.pageX + 1, e.pageY + 1);
		}
		else{
			me.displayWithAbsoluteCoordinates(e.pageX + 1, e.pageY + 1);
		}
	};
	/**
	 * Listener to handle mouse moves in iframe
	 * @inner
	 */
	/*var handleMoveMouse2 = function(e) {
		me.displayWithAbsoluteCoordinates(e.pageX + me.rectX + 1, e.pageY + me.rectY + 1);
	};*/
	this.document.addEventListener("mousemove", handleMoveMouse1, false);
	//this.DOM.addEventListener("mousemove", handleMoveMouse2, false);
	
	/**
	 * Listener to finish off move when a click is made
	 * @inner
	 */
	var handleMove = function(e) {
		
		me.document.removeEventListener("mousemove", handleMoveMouse1, false);
		//me.DOM.removeEventListener("mousemove", handleMoveMouse2, false);
		me.document.removeEventListener("click", handleMove, false);
		me.dragging=false;
		
		
		// stop propagation
		e.stopPropagation();
		e.preventDefault();
	};	
	this.document.addEventListener("mouseup", handleMove, false);
	me.DOM.addEventListener("mouseup", handleMove, false);
	body.style.cursor = "pointer";

}

Zotero.AXE_rectangle.prototype.resizeBox=function(absX,absY){

	
	this.DOM.style.width = absX-parseInt(this.DOM.style.left)+"px";

	this.DOM.style.height =  absY-parseInt(this.DOM.style.top)+"px";

	this.resizeOutline.style.top = parseInt(this.DOM.style.top)+parseInt(this.DOM.style.height)-10;
	this.resizeOutline.style.left = parseInt(this.DOM.style.left)+parseInt(this.DOM.style.width)-10;
}
Zotero.AXE_rectangle.prototype.displayWithAbsoluteCoordinates = function(absX, absY) {
	//if(!this.node) throw "Annotation not initialized!";
	
	var startScroll = this.window.scrollMaxX;
	
	
	this.DOM.style.left = absX+"px";
	this.rectX = absX;
	this.DOM.style.top =  absY+"px";
	this.rectY = absY;
	this.resizeOutline.style.top = parseInt(absY)+parseInt(this.DOM.style.height)-10;
	this.resizeOutline.style.left = parseInt(absX)+parseInt(this.DOM.style.width)-10;

	
}




Zotero.AXE_polygon=function(img, nodes, noteRef){
	this.img = img; // tagged AXEImage object
	this.coords = coords; // array of nodes outlining polygon 
	this.noteRef = noteRef; // href to note	
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
Zotero.AXE_node = function(parentNode,posX,posY){
	// A node in a polygon, created a position posX,posY within a 
	// parent node (parentNode)	
	this.parentNode = parentNode;
	this.posX = posX;
	this.posY = posY;
	this.clickBehavior // 0 = do nothing
					   // 1 = select to move
					   // 2 = draw polygon;
					   // 3 = remove 
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