ScholarItemPane = new function()
{
	var _dynamicFields;
	var _creatorTypeMenu;
	var _beforeRow;
	var _notesPane;
	
	var _creatorCount;
	
	var _itemBeingEdited;
	
	this.onLoad = onLoad;
	this.viewItem = viewItem;
	this.addCreatorRow = addCreatorRow;
	this.removeCreator = removeCreator;
	this.showEditor = showEditor;
	this.hideEditor = hideEditor;
	this.modifyField = modifyField;
	this.modifyCreator = modifyCreator;
	
	function onLoad()
	{
		_dynamicFields = document.getElementById('editpane-dynamic-fields');
		_creatorTypeMenu = document.getElementById('creatorTypeMenu');
		_notesPane = document.getElementById('scholar-notes');
		
		var creatorTypes = Scholar.CreatorTypes.getTypes();
		for(var i = 0; i < creatorTypes.length; i++)
		{
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label",Scholar.getString('creatorTypes.'+creatorTypes[i]['name']));
			menuitem.setAttribute("typeid",creatorTypes[i]['id']);
			if(creatorTypes[i]['id'] == 0)
				menuitem.setAttribute("selected",true);
			_creatorTypeMenu.appendChild(menuitem);
		}
		
		return true;
	}
	
	/*
	 * Loads an item 
	 */
	function viewItem(thisItem)
	{		
		_itemBeingEdited = thisItem;
		
		reloadFields();
	}
	
	function reloadFields()
	{
		while(_dynamicFields.hasChildNodes())
			_dynamicFields.removeChild(_dynamicFields.firstChild);
		
		var fieldNames = new Array("title","dateAdded","dateModified");
		var fields = Scholar.ItemFields.getItemTypeFields(_itemBeingEdited.getField("itemTypeID"));
		for(var i = 0; i<fields.length; i++)
			fieldNames.push(Scholar.ItemFields.getName(fields[i]));
		
		for(var i = 0; i<fieldNames.length; i++)
		{
			if(fieldNames[i] != 'notes')
			{
				var editable = (!_itemBeingEdited.isPrimaryField(fieldNames[i]) || _itemBeingEdited.isEditableField(fieldNames[i]));
				
				var valueElement = createValueElement(_itemBeingEdited.getField(fieldNames[i]), editable ? fieldNames[i] : null);
				
				var label = document.createElement("label");
				label.setAttribute("value",Scholar.getString("itemFields."+fieldNames[i])+":");
				
				addDynamicRow(label,valueElement);
			}
			else
			{
				_notesPane.value = _itemBeingEdited.getField(fieldNames[i]);
			}
		}
		
		_beforeRow = _dynamicFields.firstChild.nextSibling;
		_creatorCount = 0;
		if(_itemBeingEdited.numCreators() > 0)
		{
			for(var i = 0, len=_itemBeingEdited.numCreators(); i<len; i++)
			{
				var creator = _itemBeingEdited.getCreator(i);
				addCreatorRow(creator['firstName'], creator['lastName'], creator['creatorTypeID']);
			}
		}
		else
		{
			addCreatorRow('', '', 1);
		}
	}
	
	function addDynamicRow(label, value, beforeElement)
	{		
		var row = document.createElement("row");
		row.appendChild(label);
		row.appendChild(value);
		if(beforeElement)
			_dynamicFields.insertBefore(row, _beforeRow);
		else	
			_dynamicFields.appendChild(row);		
	}
	
	function addCreatorRow(firstName, lastName, typeID)
	{
		if(!firstName)
			firstName = "(first)";
		if(!lastName)
			lastName = "(last)";
		var label = document.createElement("label");
		label.setAttribute("value",Scholar.getString('creatorTypes.'+Scholar.CreatorTypes.getTypeName(typeID))+":");
		label.setAttribute("popup","creatorTypeMenu");
		label.setAttribute("fieldname",'creator-'+_creatorCount+'-typeID');
		
		var row = document.createElement("hbox");
		
		var firstlast = document.createElement("hbox");
		firstlast.setAttribute("flex","1");
		firstlast.appendChild(createValueElement(lastName+",", 'creator-'+_creatorCount+'-lastName'));
		firstlast.appendChild(createValueElement(firstName, 'creator-'+_creatorCount+'-firstName'));
		row.appendChild(firstlast);
		
		var removeButton = document.createElement('label');
		removeButton.setAttribute("value","-");
		removeButton.setAttribute("class","addremove");
		removeButton.setAttribute("onclick","ScholarItemPane.removeCreator("+_creatorCount+")");
		row.appendChild(removeButton);
		
		var addButton = document.createElement('label');
		addButton.setAttribute("value","+");
		addButton.setAttribute("class","addremove");
		addButton.setAttribute("onclick","ScholarItemPane.addCreatorRow('','',1);");
		row.appendChild(addButton);
		
		_creatorCount++;
		
		addDynamicRow(label, row, true);
	}
	
	function createValueElement(valueText, fieldName)
	{
	 	var valueElement = document.createElement("label");
		if(fieldName)
		{
			valueElement.setAttribute('fieldname',fieldName);
			valueElement.setAttribute('onclick', 'ScholarItemPane.showEditor(this);');
		}
		
		var firstSpace = valueText.indexOf(" ");
		if((firstSpace == -1 && valueText.length > 29 ) || firstSpace > 29)
		{
			valueElement.setAttribute('crop', 'end');
			valueElement.setAttribute('value',valueText);
		}
		else
			valueElement.appendChild(document.createTextNode(valueText));
		return valueElement;
	}
	
	function removeCreator(index)
	{
		_itemBeingEdited.removeCreator(index);
		_itemBeingEdited.save();
		reloadFields();
	}
	
	function showEditor(elem)
	{
		var fieldName = elem.getAttribute('fieldname');
		var value = '';
		var creatorFields = fieldName.split('-');
		if(creatorFields[0] == 'creator')
		{
			var c = _itemBeingEdited.getCreator(creatorFields[1]);
			if(c)
				value = c[creatorFields[2]];
		}
		else
		{
			value = _itemBeingEdited.getField(fieldName);
		}
		
		var t = document.createElement("textbox");
		t.setAttribute('value',value);
		t.setAttribute('fieldname',fieldName);
		t.setAttribute('flex','1');
		
		var box = elem.parentNode;
		box.replaceChild(t,elem);
		
		t.select();
		t.setAttribute('onblur',"ScholarItemPane.hideEditor(this, true);");
		t.setAttribute('onkeypress','if(event.keyCode == event.DOM_VK_RETURN) document.commandDispatcher.focusedElement.blur(); else if(event.keyCode == event.DOM_VK_ESCAPE) ScholarItemPane.hideEditor(document.commandDispatcher.focusedElement, false);'); //for some reason I can't just say this.blur();
	}
	
	function hideEditor(t, saveChanges)
	{
		var textbox = t.parentNode.parentNode;
		var fieldName = textbox.getAttribute('fieldname');
		var value = t.value;
		
		var elem;
		var creatorFields = fieldName.split('-');
		if(creatorFields[0] == 'creator')
		{
			if(saveChanges)
				modifyCreator(creatorFields[1],creatorFields[2],value);
			
			elem = createValueElement(_itemBeingEdited.getCreator(creatorFields[1])[creatorFields[2]], fieldName);
		}
		else
		{
			if(saveChanges)
				modifyField(fieldName,value);
		
			elem = createValueElement(_itemBeingEdited.getField(fieldName),fieldName);
		}
		
		var box = textbox.parentNode;
		box.replaceChild(elem,textbox);
		
	}
	
	function modifyField(field, value)
	{
		_itemBeingEdited.setField(field,value);
		_itemBeingEdited.save();
	}
	
	function modifyCreator(index, field, value)
	{
		var creator = _itemBeingEdited.getCreator(index);
		var firstName = creator['firstName'];
		var lastName = creator['lastName'];
		var typeID = creator['typeID'];
		
		if(field == 'firstName')
			firstName = value;
		else if(field == 'lastName')
			lastName = value;
		else if(field == 'typeID')
			typeID = value;
		
		_itemBeingEdited.setCreator(index, firstName, lastName, typeID);
		_itemBeingEdited.save();
	}
}

addEventListener("load", function(e) { ScholarItemPane.onLoad(e); }, false);
