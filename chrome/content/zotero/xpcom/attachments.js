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

Zotero.Attachments = new function(){
	this.LINK_MODE_IMPORTED_FILE = 0;
	this.LINK_MODE_IMPORTED_URL = 1;
	this.LINK_MODE_LINKED_FILE = 2;
	this.LINK_MODE_LINKED_URL = 3;
	
	this.importFromFile = importFromFile;
	this.linkFromFile = linkFromFile;
	this.importSnapshotFromFile = importSnapshotFromFile;
	this.importFromURL = importFromURL;
	this.linkFromURL = linkFromURL;
	this.linkFromDocument = linkFromDocument;
	this.importFromDocument = importFromDocument;
	
	var self = this;
	
	function importFromFile(file, sourceItemID){
		Zotero.debug('Importing attachment from file');
		
		var title = file.leafName;
		
		Zotero.DB.beginTransaction();
		
		try {
			// Create a new attachment
			var attachmentItem = Zotero.Items.getNewItemByType(Zotero.ItemTypes.getID('attachment'));
			attachmentItem.setField('title', title);
			attachmentItem.save();
			var itemID = attachmentItem.getID();
			
			// Create directory for attachment files within storage directory
			var destDir = Zotero.getStorageDirectory();
			destDir.append(itemID);
			destDir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
			
			file.copyTo(destDir, null);
			
			// Point to copied file
			var newFile = Components.classes["@mozilla.org/file/local;1"]
							.createInstance(Components.interfaces.nsILocalFile);
			newFile.initWithFile(destDir);
			newFile.append(title);
			
			var mimeType = Zotero.MIME.getMIMETypeFromFile(newFile);
			
			_addToDB(newFile, null, null, this.LINK_MODE_IMPORTED_FILE,
				mimeType, null, sourceItemID, itemID);
			
			Zotero.DB.commitTransaction();
			
			// Determine charset and build fulltext index
			_postProcessFile(itemID, newFile, mimeType);
		}
		catch (e){
			// hmph
			Zotero.DB.rollbackTransaction();
			
			try {
				// Clean up
				if (itemID){
					var itemDir = Zotero.getStorageDirectory();
					itemDir.append(itemID);
					if (itemDir.exists()){
						itemDir.remove(true);
					}
				}
			}
			catch (e) {}
			
			throw (e);
		}
		return itemID;
	}
	
	
	function linkFromFile(file, sourceItemID){
		Zotero.debug('Linking attachment from file');
		
		var title = file.leafName;
		var mimeType = Zotero.MIME.getMIMETypeFromFile(file);
		
		var itemID = _addToDB(file, null, title, this.LINK_MODE_LINKED_FILE, mimeType,
			null, sourceItemID);
		
		// Determine charset and build fulltext index
		_postProcessFile(itemID, file, mimeType);
		
		return itemID;
	}
	
	
	function importSnapshotFromFile(file, url, title, mimeType, charset, sourceItemID){
		Zotero.debug('Importing snapshot from file');
		
		var charsetID = Zotero.CharacterSets.getID(charset);
		
		Zotero.DB.beginTransaction();
		
		try {
			// Create a new attachment
			var attachmentItem = Zotero.Items.getNewItemByType(Zotero.ItemTypes.getID('attachment'));
			attachmentItem.setField('title', title);
			attachmentItem.setField('url', url);
			// DEBUG: this should probably insert access date too so as to
			// create a proper item, but at the moment this is only called by
			// translate.js, which sets the metadata fields itself
			attachmentItem.save();
			var itemID = attachmentItem.getID();
			
			var storageDir = Zotero.getStorageDirectory();
			file.parent.copyTo(storageDir, itemID);
			
			// Point to copied file
			var newFile = Components.classes["@mozilla.org/file/local;1"]
							.createInstance(Components.interfaces.nsILocalFile);
			newFile.initWithFile(storageDir);
			newFile.append(itemID);
			newFile.append(file.leafName);
			
			_addToDB(newFile, url, null, this.LINK_MODE_IMPORTED_URL, mimeType,
				charsetID, sourceItemID, itemID);
			Zotero.DB.commitTransaction();
			
			// Determine charset and build fulltext index
			_postProcessFile(itemID, newFile, mimeType);
		}
		catch (e){
			Zotero.DB.rollbackTransaction();
			
			try {
				// Clean up
				if (itemID){
					var itemDir = Zotero.getStorageDirectory();
					itemDir.append(itemID);
					if (itemDir.exists()){
						itemDir.remove(true);
					}
				}
			}
			catch (e) {}
			
			throw (e);
		}
		return itemID;
	}
	
	
	function importFromURL(url, sourceItemID, forceTitle){
		Zotero.debug('Importing attachment from URL');
		
		Zotero.Utilities.HTTP.doHead(url, function(obj){
			var mimeType = obj.channel.contentType;
			
			var nsIURL = Components.classes["@mozilla.org/network/standard-url;1"]
						.createInstance(Components.interfaces.nsIURL);
			nsIURL.spec = url;
			var ext = nsIURL.fileExtension;
			
			// Override MIME type to application/pdf if extension is .pdf --
			// workaround for sites that respond to the HEAD request with an
			// invalid MIME type (https://www.zotero.org/trac/ticket/460)
			if (ext == 'pdf') {
				mimeType = 'application/pdf';
			}
			
			// If we can load this natively, use a hidden browser (so we can
			// get the charset and title and index the document)
			if (Zotero.MIME.hasNativeHandler(mimeType, ext)){
				var browser = Zotero.Browser.createHiddenBrowser();
				browser.addEventListener("pageshow", function(){
					Zotero.Attachments.importFromDocument(browser.contentDocument, sourceItemID, forceTitle);
					browser.removeEventListener("pageshow", arguments.callee, true);
					Zotero.Browser.deleteHiddenBrowser(browser);
				}, true);
				browser.loadURI(url);
			}
			
			// Otherwise use a remote web page persist
			else {
				var fileName = _getFileNameFromURL(url, mimeType);
				var title = forceTitle ? forceTitle : fileName;
				
				const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
				var wbp = Components
					.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
					.createInstance(nsIWBP);
				wbp.persistFlags = nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
				var encodingFlags = false;
				
				Zotero.DB.beginTransaction();
				
				try {
					// Create a new attachment
					var attachmentItem = Zotero.Items.getNewItemByType(Zotero.ItemTypes.getID('attachment'));
					attachmentItem.setField('title', title);
					attachmentItem.setField('url', url);
					attachmentItem.setField('accessDate', "CURRENT_TIMESTAMP");
					attachmentItem.save();
					var itemID = attachmentItem.getID();
					
					// Create a new folder for this item in the storage directory
					var destDir = Zotero.getStorageDirectory();
					destDir.append(itemID);
					destDir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
					
					var file = Components.classes["@mozilla.org/file/local;1"].
							createInstance(Components.interfaces.nsILocalFile);
					file.initWithFile(destDir);
					file.append(fileName);
					
					wbp.progressListener = new Zotero.WebProgressFinishListener(function(){
						try {
							_addToDB(file, url, title, Zotero.Attachments.LINK_MODE_IMPORTED_URL,
								mimeType, null, sourceItemID, itemID);
						}
						catch (e) {
							// Clean up
							if (itemID) {
								var item = Zotero.Items.get(itemID);
								if (item) {
									item.erase();
								}
								
								try {
									var destDir = Zotero.getStorageDirectory();
									destDir.append(itemID);
									if (destDir.exists()) {
										destDir.remove(true);
									}
								}
								catch (e) {}
							}
							
							throw (e);
						}
					});
					
					// The attachment is still incomplete here, but we can't risk
					// leaving the transaction open if the callback never triggers
					Zotero.DB.commitTransaction();
					
					wbp.saveURI(nsIURL, null, null, null, null, file);
				}
				catch (e){
					Zotero.DB.rollbackTransaction();
					
					try {
						// Clean up
						if (itemID) {
							var destDir = Zotero.getStorageDirectory();
							destDir.append(itemID);
							if (destDir.exists()) {
								destDir.remove(true);
							}
						}
					}
					catch (e) {}
					
					throw (e);
				}
			}
		});
	}
	
	
	function linkFromURL(url, sourceItemID, mimeType, title){
		Zotero.debug('Linking attachment from URL');
		
		// If no title provided, figure it out from the URL
		if (!title){
			title = url.substring(url.lastIndexOf('/')+1);
		}
		
		// If we have the title and mime type, skip loading
		if (title && mimeType){
			return _addToDB(null, url, title, this.LINK_MODE_LINKED_URL, mimeType,
				null, sourceItemID);
		}
		
		// Otherwise do a head request for the mime type
		Zotero.Utilities.HTTP.doHead(url, function(obj){
			var mimeType = obj.channel.contentType;
			
			// Override MIME type to application/pdf if extension is .pdf --
			// workaround for sites that respond to the HEAD request with an
			// invalid MIME type (https://www.zotero.org/trac/ticket/460)
			var ext = _getExtensionFromURL(url);
			if (ext == 'pdf') {
				mimeType = 'application/pdf';
			}
			
			_addToDB(null, url, title, Zotero.Attachments.LINK_MODE_LINKED_URL,
				mimeType, null, sourceItemID);
		});
		
		return true;
	}
	
	
	// TODO: what if called on file:// document?
	function linkFromDocument(document, sourceItemID, parentCollectionIDs){
		Zotero.debug('Linking attachment from document');
		
		var url = document.location.href;
		var title = document.title; // TODO: don't use Mozilla-generated title for images, etc.
		var mimeType = document.contentType;
		var charsetID = Zotero.CharacterSets.getID(document.characterSet);
		
		var itemID = _addToDB(null, url, title, this.LINK_MODE_LINKED_URL,
			mimeType, charsetID, sourceItemID);
		
		// Add to collections
		if (parentCollectionIDs){
			var ids = Zotero.flattenArguments(parentCollectionIDs);
			for each(var id in ids){
				var col = Zotero.Collections.get(id);
				col.addItem(itemID);
			}
		}
		
		// Run the fulltext indexer asynchronously (actually, it hangs the UI
		// thread, but at least it lets the menu close)
		setTimeout(function(){
			Zotero.Fulltext.indexDocument(document, itemID);
		}, 50);
		
		return itemID;
	}
	
	
	function importFromDocument(document, sourceItemID, forceTitle, parentCollectionIDs){
		Zotero.debug('Importing attachment from document');
		
		var url = document.location.href;
		var title = forceTitle ? forceTitle : document.title;
		var mimeType = document.contentType;
		var charsetID = Zotero.CharacterSets.getID(document.characterSet);
		
		if (!forceTitle) {
			// Remove e.g. " - Scaled (-17%)" from end of images saved from links,
			// though I'm not sure why it's getting added to begin with
			if (mimeType.indexOf('image/') === 0) {
				title = title.replace(/(.+ \([^,]+, [0-9]+x[0-9]+[^\)]+\)) - .+/, "$1" );
			}
			// If not native type, strip mime type data in parens
			else if (!Zotero.MIME.hasNativeHandler(mimeType, _getExtensionFromURL(url))) {
				title = title.replace(/(.+) \([a-z]+\/[^\)]+\)/, "$1" );
			}
		}
		
		const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
		var wbp = Components
			.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
			.createInstance(nsIWBP);
		wbp.persistFlags = nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
		var encodingFlags = false;
		
		Zotero.DB.beginTransaction();
		
		try {
			// Create a new attachment
			var attachmentItem = Zotero.Items.getNewItemByType(Zotero.ItemTypes.getID('attachment'));
			attachmentItem.setField('title', title);
			attachmentItem.setField('url', url);
			attachmentItem.setField('accessDate', "CURRENT_TIMESTAMP");
			attachmentItem.save();
			var itemID = attachmentItem.getID();
			
			// Create a new folder for this item in the storage directory
			var destDir = Zotero.getStorageDirectory();
			destDir.append(itemID);
			destDir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
			
			var file = Components.classes["@mozilla.org/file/local;1"].
					createInstance(Components.interfaces.nsILocalFile);
			file.initWithFile(destDir);
			
			var fileName = _getFileNameFromURL(url, mimeType);
			
			// This is a hack to make sure the file is opened in the browser when
			// we use loadURI(), since Firefox's internal detection mechanisms seem
			// to sometimes get confused
			// 		(see #192, https://chnm.gmu.edu/trac/zotero/ticket/192)
			if (mimeType=='text/html' &&
					(fileName.substr(fileName.length-5)!='.html'
						&& fileName.substr(fileName.length-4)!='.htm')){
				fileName += '.html';
			}
			
			file.append(fileName);
			
			wbp.progressListener = new Zotero.WebProgressFinishListener(function(){
				try {
					Zotero.DB.beginTransaction();
					
					_addToDB(file, url, title, Zotero.Attachments.LINK_MODE_IMPORTED_URL, mimeType,
						charsetID, sourceItemID, itemID);
					
					// Add to collections
					if (parentCollectionIDs){
						var ids = Zotero.flattenArguments(parentCollectionIDs);
						for each(var id in ids){
							var col = Zotero.Collections.get(id);
							col.addItem(itemID);
						}
					}
					
					Zotero.DB.commitTransaction();
				}
				catch (e) {
					Zotero.DB.rollbackTransaction();
					
					// Clean up
					if (itemID) {
						var item = Zotero.Items.get(itemID);
						if (item) {
							item.erase();
						}
						
						try {
							var destDir = Zotero.getStorageDirectory();
							destDir.append(itemID);
							if (destDir.exists()) {
								destDir.remove(true);
							}
						}
						catch (e) {}
					}
					
					throw (e);
				}
				
				Zotero.Fulltext.indexDocument(document, itemID);
			});
			
			// The attachment is still incomplete here, but we can't risk
			// leaving the transaction open if the callback never triggers
			Zotero.DB.commitTransaction();
			
			if (mimeType == 'text/html') {
				Zotero.debug('Saving with saveDocument()');
				wbp.saveDocument(document, file, destDir, mimeType, encodingFlags, false);
			}
			else {
				Zotero.debug('Saving with saveURI()');
				var ioService = Components.classes["@mozilla.org/network/io-service;1"]
					.getService(Components.interfaces.nsIIOService);
				var nsIURL = ioService.newURI(url, null, null);
				wbp.saveURI(nsIURL, null, null, null, null, file);
			}
		}
		catch (e) {
			Zotero.DB.rollbackTransaction();
			
			try {
				// Clean up
				if (itemID) {
					var destDir = Zotero.getStorageDirectory();
					destDir.append(itemID);
					if (destDir.exists()) {
						destDir.remove(true);
					}
				}
			}
			catch (e) {}
			
			throw (e);
		}
	}
	
	
	function _getFileNameFromURL(url, mimeType){
		var nsIURL = Components.classes["@mozilla.org/network/standard-url;1"]
					.createInstance(Components.interfaces.nsIURL);
		nsIURL.spec = url;
		
		if (nsIURL.fileName){
			return nsIURL.fileName;
		}
		
		if (mimeType){
			try {
				var ext = Components.classes["@mozilla.org/mime;1"]
					.getService(Components.interfaces.nsIMIMEService)
					.getPrimaryExtension(mimeType, nsIURL.fileExtension);
			}
			// getPrimaryExtension doesn't work on Linux
			catch (e) {}
		}
		
		return nsIURL.host + (ext ? '.' + ext : '');
	}
	
	
	function _getExtensionFromURL(url) {
		var nsIURL = Components.classes["@mozilla.org/network/standard-url;1"]
					.createInstance(Components.interfaces.nsIURL);
		nsIURL.spec = url;
		return nsIURL.fileExtension;
	}
	
	
	/**
	* Create a new item of type 'attachment' and add to the itemAttachments table
	*
	* Passing an itemID causes it to skip new item creation and use the specified
	* item instead -- used when importing files (since we have to know
	* the itemID before copying in a file and don't want to update the DB before
	* the file is saved)
	*
	* Returns the itemID of the new attachment
	**/
	function _addToDB(file, url, title, linkMode, mimeType, charsetID, sourceItemID, itemID){
		if (file){
			if (linkMode==self.LINK_MODE_IMPORTED_URL ||
					linkMode==self.LINK_MODE_IMPORTED_FILE){
				var storageDir = Zotero.getStorageDirectory();
				storageDir.QueryInterface(Components.interfaces.nsILocalFile);
				var path = file.getRelativeDescriptor(storageDir);
			}
			else {
				var path = file.persistentDescriptor;
			}
		}
		
		Zotero.DB.beginTransaction();
		
		if (sourceItemID){
			var sourceItem = Zotero.Items.get(sourceItemID);
			if (!sourceItem){
				Zotero.DB.commitTransaction();
				throw ("Cannot set attachment source to invalid item " + sourceItemID);
			}
			if (sourceItem.isAttachment()){
				Zotero.DB.commitTransaction();
				throw ("Cannot set attachment source to another file (" + sourceItemID + ")");
			}
		}
		
		// If an itemID is provided, use that
		if (itemID){
			var attachmentItem = Zotero.Items.get(itemID);
			if (!attachmentItem.isAttachment()){
				throw ("Item " + itemID + " is not a valid attachment in _addToDB()");
			}
		}
		// Otherwise create a new attachment
		else {
			var attachmentItem = Zotero.Items.getNewItemByType(Zotero.ItemTypes.getID('attachment'));
			attachmentItem.setField('title', title);
			if (linkMode==self.LINK_MODE_IMPORTED_URL
				|| linkMode==self.LINK_MODE_LINKED_URL){
				attachmentItem.setField('url', url);
				attachmentItem.setField('accessDate', "CURRENT_TIMESTAMP");
			}
			attachmentItem.save();
		}
		
		var sql = "INSERT INTO itemAttachments (itemID, sourceItemID, linkMode, "
			+ "mimeType, charsetID, path) VALUES (?,?,?,?,?,?)";
		var bindParams = [
			attachmentItem.getID(),
			(sourceItemID ? {int:sourceItemID} : null),
			{int:linkMode},
			{string:mimeType},
			(charsetID ? {int:charsetID} : null),
			(path ? {string:path} : null)
		];
		Zotero.DB.query(sql, bindParams);
		Zotero.DB.commitTransaction();
		
		if (sourceItemID){
			sourceItem.incrementAttachmentCount();
			Zotero.Notifier.trigger('modify', 'item', sourceItemID);
		}
		
		Zotero.Notifier.trigger('add', 'item', attachmentItem.getID());
		
		return attachmentItem.getID();
	}
	
	
	/*
	 * Since we have to load the content into the browser to get the
	 * character set (at least until we figure out a better way to get
	 * at the native detectors), we create the item above and update
	 * asynchronously after the fact
	 */
	function _postProcessFile(itemID, file, mimeType){
		var ext = Zotero.File.getExtension(file);
		if (mimeType.substr(0, 5)!='text/' ||
			!Zotero.MIME.hasInternalHandler(mimeType, ext)){
			return false;
		}
		
		var browser = Zotero.Browser.createHiddenBrowser();
		
		Zotero.File.addCharsetListener(browser, new function(){
			return function(charset, id){
				var charsetID = Zotero.CharacterSets.getID(charset);
				if (charsetID){
					var sql = "UPDATE itemAttachments SET charsetID=" + charsetID
						+ " WHERE itemID=" + itemID;
					Zotero.DB.query(sql);
				}
				
				// Chain fulltext indexer inside the charset callback,
				// since it's asynchronous and a prerequisite
				Zotero.Fulltext.indexDocument(browser.contentDocument, itemID);
			}
		}, itemID);
		
		var url = Components.classes["@mozilla.org/network/protocol;1?name=file"]
					.getService(Components.interfaces.nsIFileProtocolHandler)
					.getURLSpecFromFile(file);
		browser.loadURI(url);
	}
}
