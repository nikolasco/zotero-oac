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

//
// Zotero Translate Engine
//

/*
 * Zotero.Translate: a class for translation of Zotero metadata from and to
 * other formats
 *
 * eventually, Zotero.Ingester may be rolled in here (i.e., after we get rid
 * of RDF)
 *
 * type can be: 
 * export
 * import
 * web
 * search
 *
 * a typical export process:
 * var translatorObj = new Zotero.Translate();
 * var possibleTranslators = translatorObj.getTranslators();
 * // do something involving nsIFilePicker; remember, each possibleTranslator
 * // object has properties translatorID, label, and targetID
 * translatorObj.setLocation(myNsILocalFile);
 * translatorObj.setTranslator(possibleTranslators[x]); // also accepts only an ID
 * translatorObj.setHandler("done", _translationDone);
 * translatorObj.translate();
 *
 *
 * PUBLIC PROPERTIES:
 *
 * type - the text type of translator (set by constructor, should be read only)
 * document - the document object to be used for web scraping (read-only; set
 *           with setDocument)
 * translator - the translator currently in use (read-only; set with
 *               setTranslator)
 * location - the location of the target (read-only; set with setLocation)
 *            for import/export - this is an instance of nsILocalFile
 *            for web - this is a URL
 * search - item (in toArray() format) to extrapolate data for (read-only; set
 *          with setSearch).
 * items - items (in Zotero.Item format) to be exported. if this is empty,
 *         Zotero will export all items in the library (read-only; set with
 *         setItems). setting items disables export of collections.
 * path - the path to the target; for web, this is the same as location
 * string - the string content to be used as a file.
 * saveItem - whether new items should be saved to the database. defaults to
 *            true; set using second argument of constructor.
 * newItems - items created when translate() was called
 * newCollections - collections created when translate() was called
 *
 * PRIVATE PROPERTIES:
 * 
 * _numericTypes - possible numeric types as a comma-delimited string
 * _handlers - handlers for various events (see setHandler)
 * _configOptions - options set by translator modifying behavior of
 *                  Zotero.Translate
 * _displayOptions - options available to user for this specific translator
 * _waitForCompletion - whether to wait for asynchronous completion, or return
 *                      immediately when script has finished executing
 * _sandbox - sandbox in which translators will be executed
 * _streams - streams that need to be closed when execution is complete
 * _IDMap - a map from IDs as specified in Zotero.Item() to IDs of actual items
 * _parentTranslator - set when a translator is called from another translator. 
 *                     among other things, disables passing of the translate
 *                     object to handlers and modifies complete() function on 
 *                     returned items
 * _storage - the stored string to be treated as input
 * _storageLength - the length of the stored string
 * _exportFileDirectory - the directory to which files will be exported
 * _hasBOM - whether the given file ready to be imported has a BOM or not
 *
 * WEB-ONLY PROPERTIES:
 *
 * locationIsProxied - whether the URL being scraped is going through
 *                      an EZProxy
 * _downloadAssociatedFiles - whether to download content, according to
 *                            preferences
 */

Zotero.Translate = function(type, saveItem) {
	this.type = type;
	
	// import = 0001 = 1
	// export = 0010 = 2
	// web    = 0100 = 4
	// search = 1000 = 8
	
	// combination types determined by addition or bitwise AND
	// i.e., import+export = 1+2 = 3
	this._numericTypes = "";
	for(var i=0; i<=1; i++) {
		for(var j=0; j<=1; j++) {
			for(var k=0; k<=1; k++) {
				if(type == "import") {
					this._numericTypes += ","+parseInt(i.toString()+j.toString()+k.toString()+"1", 2);
				} else if(type == "export") {
					this._numericTypes += ","+parseInt(i.toString()+j.toString()+"1"+k.toString(), 2);
				} else if(type == "web") {
					this._numericTypes += ","+parseInt(i.toString()+"1"+j.toString()+k.toString(), 2);
				} else if(type == "search") {
					this._numericTypes += ","+parseInt("1"+i.toString()+j.toString()+k.toString(), 2);
				} else {
					throw("invalid import type");
				}
			}
		}
	}
	this._numericTypes = this._numericTypes.substr(1);
	
	if(saveItem === false) {	// three equals signs means if it's left
								// undefined, this.saveItem will still be true
		this.saveItem = false;
	} else {
		this.saveItem = true;
	}
	
	this._handlers = new Array();
	this._streams = new Array();
}

/*
 * (singleton) initializes scrapers, loading from the database and separating
 * into types
 */
Zotero.Translate.init = function() {
	if(!Zotero.Translate.cache) {
		var cachePref = Zotero.Prefs.get("cacheTranslatorData");
		
		if(cachePref) {
			// fetch translator list
			var translators = Zotero.DB.query("SELECT translatorID, translatorType, label, "+
				"target, detectCode IS NULL as noDetectCode FROM translators "+
				"ORDER BY target IS NULL, priority, label");
			var detectCodes = Zotero.DB.query("SELECT translatorID, detectCode FROM translators WHERE target IS NULL");
			
			Zotero.Translate.cache = new Object();
			Zotero.Translate.cache["import"] = new Array();
			Zotero.Translate.cache["export"] = new Array();
			Zotero.Translate.cache["web"] = new Array();
			Zotero.Translate.cache["search"] = new Array();
			
			for each(translator in translators) {
				var type = translator.translatorType;
				
				// not sure why this is necessary
				var wrappedTranslator = {translatorID:translator.translatorID,
				                         label:translator.label,
				                         target:translator.target}
				
				if(translator.noDetectCode) {
					wrappedTranslator.noDetectCode = true;
				}
				
				// import translator
				var mod = type % 2;
				if(mod) {
					var regexp = new RegExp();
					regexp.compile("\."+translator.target+"$", "i");
					wrappedTranslator.importRegexp = regexp;
					Zotero.Translate.cache["import"].push(wrappedTranslator);
					type -= mod;
				}
				// search translator
				var mod = type % 4;
				if(mod) {
					Zotero.Translate.cache["export"].push(wrappedTranslator);
					type -= mod;
				}
				// web translator
				var mod = type % 8;
				if(mod) {
					var regexp = new RegExp();
					regexp.compile(translator.target, "i");
					wrappedTranslator.webRegexp = regexp;
					Zotero.Translate.cache["web"].push(wrappedTranslator);
					
					if(!translator.target) {
						for each(var detectCode in detectCodes) {
							if(detectCode.translatorID == translator.translatorID) {
								wrappedTranslator.detectCode = detectCode.detectCode;
							}
						}
					}
					type -= mod;
				}
				// search translator
				var mod = type % 16;
				if(mod) {
					Zotero.Translate.cache["search"].push(wrappedTranslator);
					type -= mod;
				}
			}
		}
		
	}
}

/*
 * sets the browser to be used for web translation; also sets the location
 */
Zotero.Translate.prototype.setDocument = function(doc) {
	this.document = doc;
	this.setLocation(doc.location.href);
}

/*
 * sets the item to be used for searching
 */
Zotero.Translate.prototype.setSearch = function(search) {
	this.search = search;
}

/*
 * sets the item to be used for export
 */
Zotero.Translate.prototype.setItems = function(items) {
	this.items = items;
}

/*
 * sets the location to operate upon (file should be an nsILocalFile object or
 * web address)
 */
Zotero.Translate.prototype.setLocation = function(location) {
	if(this.type == "web") {
		// account for proxies
		this.location = Zotero.Ingester.ProxyMonitor.proxyToProper(location);
		if(this.location != location) {
			// figure out if this URL is being proxies
			this.locationIsProxied = true;
		}
		this.path = this.location;
	} else {
		this.location = location;
		if(this.location instanceof Components.interfaces.nsIFile) {	// if a file
			this.path = location.path;
		} else {														// if a url
			this.path = location;
		}
	}
}

/*
 * sets the string to be used as a file
 */
Zotero.Translate.prototype.setString = function(string) {
	this._storage = string;
	this._storageLength = string.length;
	this._storagePointer = 0;
}

/*
 * sets translator display options. you can also pass a translator (not ID) to
 * setTranslator that includes a displayOptions argument
 */
Zotero.Translate.prototype.setDisplayOptions = function(displayOptions) {
	this._setDisplayOptions = displayOptions;
}

/*
 * sets the translator to be used for import/export
 *
 * accepts either the object from getTranslators() or an ID
 */
Zotero.Translate.prototype.setTranslator = function(translator) {
	if(!translator) {
		throw("cannot set translator: invalid value");
	}
	
	this._setDisplayOptions = null;
	
	if(typeof(translator) == "object") {	// passed an object and not an ID
		if(translator.translatorID) {
			if(translator.displayOptions) {
				this._setDisplayOptions = translator.displayOptions;
			}
			
			translator = [translator.translatorID];
		} else {
			// we have an associative array of translators
			if(this.type != "search") {
				throw("cannot set translator: a single translator must be specified when doing "+this.type+" translation");
			}
			// accept a list of objects
			for(var i in translator) {
				if(typeof(translator[i]) == "object") {
					if(translator[i].translatorID) {
						translator[i] = translator[i].translatorID;
					} else {
						throw("cannot set translator: must specify a single translator or a list of translators"); 
					}
				}
			}
		}
	} else {
		translator = [translator];
	}
	
	if(!translator.length) {
		return false;
	}
	
	var where = "";
	for(var i in translator) {
		where += " OR translatorID = ?";
	}
	where = where.substr(4);
	
	var sql = "SELECT * FROM translators WHERE "+where+" AND translatorType IN ("+this._numericTypes+")";
	this.translator = Zotero.DB.query(sql, translator);
	if(!this.translator) {
		return false;
	}
	
	return true;
}

/*
 * registers a handler function to be called when translation is complete
 * 
 * as the first argument, all handlers will be passed the current function. the
 * second argument is dependent on the handler.
 *
 * select
 *   valid: web
 *   called: when the user needs to select from a list of available items
 *   passed: an associative array in the form id => text
 *   returns: a numerically indexed array of ids, as extracted from the passed
 *            string
 *
 * itemCount
 *   valid: export
 *   called: when the export 
 *   passed: the number of items to be processed
 *   returns: N/A
 *
 * itemDone
 *   valid: import, web, search
 *   called: when an item has been processed; may be called asynchronously
 *   passed: an item object (see Zotero.Item)
 *   returns: N/A
 *
 * collectionDone
 *   valid: import
 *   called: when a collection has been processed, after all items have been
 *           added; may be called asynchronously
 *   passed: a collection object (see Zotero.Collection)
 *   returns: N/A
 * 
 * done
 *   valid: all
 *   called: when all processing is finished
 *   passed: true if successful, false if an error occurred
 *   returns: N/A
 */
Zotero.Translate.prototype.setHandler = function(type, handler) {
	if(!this._handlers[type]) {
		this._handlers[type] = new Array();
	}
	this._handlers[type].push(handler);
}

/*
 * gets all applicable translators
 *
 * for import, you should call this after setFile; otherwise, you'll just get
 * a list of all import filters, not filters equipped to handle a specific file
 *
 * this returns a list of translator objects, of which the following fields
 * are useful:
 *
 * translatorID - the GUID of the translator
 * label - the name of the translator
 * itemType - the type of item this scraper says it will scrape
 */
Zotero.Translate.prototype.getTranslators = function() {
	// clear BOM
	this._hasBOM = null;
	
	if(Zotero.Translate.cache) {
		var translators = Zotero.Translate.cache[this.type];
	} else {
		var sql = "SELECT translatorID, label, target, detectCode IS NULL as "+
			"noDetectCode FROM translators WHERE translatorType IN ("+this._numericTypes+") "+
			"ORDER BY target IS NULL, priority, label";
		var translators = Zotero.DB.query(sql);
	}
	
	// create a new sandbox
	this._generateSandbox();
	
	var possibleTranslators = new Array();
	Zotero.debug("searching for translators for "+(this.path ? this.path : "an undisclosed location"));
	
	// see which translators can translate
	var possibleTranslators = this._findTranslators(translators);
	
	this._closeStreams();
	
	return possibleTranslators;
}

/*
 * finds applicable translators from a list. if the second argument is given,
 * extension-based exclusion is inverted, so that only detectCode is used to
 * determine if a translator can be run.
 */
Zotero.Translate.prototype._findTranslators = function(translators, ignoreExtensions) {
	var possibleTranslators = new Array();
	for(var i in translators) {
		if(this._canTranslate(translators[i], ignoreExtensions)) {
			Zotero.debug("found translator "+translators[i].label);
			
			// for some reason, and i'm not quite sure what this reason is,
			// we HAVE to do this to get things to work right; we can't
			// just push a normal translator object from an SQL statement
			var translator = {translatorID:translators[i].translatorID,
					label:translators[i].label,
					target:translators[i].target,
					itemType:translators[i].itemType};
			if(this.type == "export") {
				translator.displayOptions = this._displayOptions;
			}
			
			possibleTranslators.push(translator);
		}
	}
	if(!possibleTranslators.length && this.type == "import" && !ignoreExtensions) {
		Zotero.debug("looking a second time");
		// try search again, ignoring file extensions
		return this._findTranslators(translators, true);
	}
	return possibleTranslators;
}

/*
 * loads a translator into a sandbox
 */
Zotero.Translate.prototype._loadTranslator = function() {
	if(!this._sandbox || this.type == "search") {
		// create a new sandbox if none exists, or for searching (so that it's
		// bound to the correct url)
		this._generateSandbox();
	}
	
	// parse detect code for the translator
	this._parseDetectCode(this.translator[0]);
	
	Zotero.debug("parsing code for "+this.translator[0].label);
	
	try {
		Components.utils.evalInSandbox(this.translator[0].code, this._sandbox);
	} catch(e) {
		if(this._parentTranslator) {
			throw(e);
		} else {
			Zotero.debug(e+' in parsing code for '+this.translator[0].label);
			this._translationComplete(false, e);
			return false;
		}
	}
	
	return true;
}

/*
 * does the actual translation
 */
Zotero.Translate.prototype.translate = function() {
	Zotero.debug("translate called");
	
	/*
	 * initialize properties
	 */
	this.newItems = new Array();
	this.newCollections = new Array();
	this._IDMap = new Array();
	this._complete = false;
	this._hasBOM = null;
	
	if(!this.translator || !this.translator.length) {
		throw("cannot translate: no translator specified");
	}
	
	if(!this.location && this.type != "search" && !this._storage) {
		// searches operate differently, because we could have an array of
		// translators and have to go through each
		throw("cannot translate: no location specified");
	}
	
	if(!this._loadTranslator()) {
		return;
	}
	
	if(this._setDisplayOptions) {
		this._displayOptions = this._setDisplayOptions;
	}
	
	if(this._storage) {
		// enable reading from storage, which we can't do until the translator
		// is loaded
		this._storageFunctions(true);
	}
	
	var returnValue;
	if(this.type == "web") {
		returnValue = this._web();
	} else if(this.type == "import") {
		returnValue = this._import();
	} else if(this.type == "export") {
		returnValue = this._export();
	} else if(this.type == "search") {
		returnValue = this._search();
	}
	
	if(returnValue && !this._waitForCompletion) {
		// if synchronous, call _translationComplete();
		this._translationComplete(true);
	}
}

/*
 * generates a sandbox for scraping/scraper detection
 */
Zotero.Translate._searchSandboxRegexp = new RegExp();
Zotero.Translate._searchSandboxRegexp.compile("^http://[\\w.]+/");
Zotero.Translate.prototype._generateSandbox = function() {
	var me = this;
	
	if(this.type == "web" || this.type == "search") {
		// get sandbox URL
		var sandboxURL = "http://www.example.com/";
		if(this.type == "web") {
			// use real URL, not proxied version, to create sandbox
			sandboxURL = this.document.location.href;
		} else {
			// generate sandbox for search by extracting domain from translator
			// target, if one exists
			if(this.translator && this.translator[0] && this.translator[0].target) {
				// so that web translators work too
				var tempURL = this.translator[0].target.replace(/\\/g, "").replace(/\^/g, "");
				var m = Zotero.Translate._searchSandboxRegexp.exec(tempURL);
				if(m) {
					sandboxURL = m[0];
				}
			} 
		}
		Zotero.debug("binding sandbox to "+sandboxURL);
		this._sandbox = new Components.utils.Sandbox(sandboxURL);
		this._sandbox.Zotero = new Object();
		
		// add ingester utilities
		this._sandbox.Zotero.Utilities = new Zotero.Utilities.Ingester(this);
		this._sandbox.Zotero.Utilities.HTTP = new Zotero.Utilities.Ingester.HTTP(this);
		
		// set up selectItems handler
		this._sandbox.Zotero.selectItems = function(options) { return me._selectItems(options) };
	} else {
		// use null URL to create sandbox. no idea why a blank string doesn't
		// work on all installations, but this should fix things.
		this._sandbox = new Components.utils.Sandbox("http://www.example.com/");
		this._sandbox.Zotero = new Object();
		
		this._sandbox.Zotero.Utilities = new Zotero.Utilities();
	}
	
	
	if(this.type == "export") {
		// add routines to retrieve items and collections
		this._sandbox.Zotero.nextItem = function() { return me._exportGetItem() };
		this._sandbox.Zotero.nextCollection = function() { return me._exportGetCollection() }
	} else {
		// copy routines to add new items
		this._sandbox.Zotero.Item = Zotero.Translate.GenerateZoteroItemClass();
		this._sandbox.Zotero.Item.prototype.complete = function() {me._itemDone(this)};
		
		if(this.type == "import") {
			// add routines to add new collections
			this._sandbox.Zotero.Collection = Zotero.Translate.GenerateZoteroItemClass();
			// attach the function to be run when a collection is done
			this._sandbox.Zotero.Collection.prototype.complete = function() {me._collectionDone(this)};
		}
	}
	
	this._sandbox.XPathResult = Components.interfaces.nsIDOMXPathResult;
	
	// for asynchronous operation, use wait()
	// done() is implemented after wait() is called
	this._sandbox.Zotero.wait = function() { me._enableAsynchronous() };
	// for adding configuration options
	this._sandbox.Zotero.configure = function(option, value) {me._configure(option, value) };
	// for adding displayed options
	this._sandbox.Zotero.addOption = function(option, value) {me._addOption(option, value) };
	// for getting the value of displayed options
	this._sandbox.Zotero.getOption = function(option) { return me._getOption(option) };
	
	// for loading other translators and accessing their methods
	this._sandbox.Zotero.loadTranslator = function(type) {
		var translation = new Zotero.Translate(type, false);
		translation._parentTranslator = me;
		
		if(type == "export" && (this.type == "web" || this.type == "search")) {
			throw("for security reasons, web and search translators may not call export translators");
		}
		
		// for security reasons, safeTranslator wraps the translator object.
		// note that setLocation() is not allowed
		var safeTranslator = new Object();
		safeTranslator.setSearch = function(arg) { return translation.setSearch(arg) };
		safeTranslator.setBrowser = function(arg) { return translation.setBrowser(arg) };
		safeTranslator.setHandler = function(arg1, arg2) { translation.setHandler(arg1, arg2) };
		safeTranslator.setString = function(arg) { translation.setString(arg) };
		safeTranslator.setTranslator = function(arg) { return translation.setTranslator(arg) };
		safeTranslator.getTranslators = function() { return translation.getTranslators() };
		safeTranslator.translate = function() {
			var noHandlers = true;
			for(var i in translation._handlers) {
				noHandlers = false;
				break;
			}
			if(noHandlers) {
				if(type != "export") {
					translation.setHandler("itemDone", function(obj, item) { item.complete() });
				}
				if(type == "web") {
					translation.setHandler("selectItems", me._handlers["selectItems"]);
				}
			}
			
			return translation.translate()
		};
		safeTranslator.getTranslatorObject = function() {
			// load the translator into our sandbox
			translation._loadTranslator();
			// initialize internal IO
			translation._initializeInternalIO();
			
			var noHandlers = true;
			for(var i in translation._handlers) {
				noHandlers = false;
				break;
			}
			if(noHandlers) {
				if(type != "export") {
					translation.setHandler("itemDone", function(obj, item) { item.complete() });
				}
				if(type == "web") {
					translation.setHandler("selectItems", me._handlers["selectItems"]);
				}
			}
			
			// return sandbox
			return translation._sandbox;
		};
		
		return safeTranslator;
	}
}

/*
 * Check to see if _scraper_ can scrape this document
 */
Zotero.Translate.prototype._canTranslate = function(translator, ignoreExtensions) {
	if((this.type == "import" || this.type == "web") && !this.location) {
		// if no location yet (e.g., getting list of possible web translators),
		// just return true
		return true;
	}
	
	// Test location with regular expression
	if(translator.target && (this.type == "import" || this.type == "web")) {
		var canTranslate = false;
		
		if(this.type == "web") {
			if(translator.webRegexp) {
				var regularExpression = translator.webRegexp;
			} else {
				var regularExpression = new RegExp(translator.target, "i");
			}
		} else {
			if(translator.importRegexp) {
				var regularExpression = translator.importRegexp;
			} else {
				var regularExpression = new RegExp("\\."+translator.target+"$", "i");
			}
		}
		
		if(regularExpression.test(this.path)) {
			canTranslate = true;
		}
		
		if(ignoreExtensions) {
			// if we're ignoring extensions, that means we already tried
			// everything without ignoring extensions and it didn't work
			canTranslate = !canTranslate;
			
			// if a translator has no detectCode, don't offer it as an option
			if(translator.noDetectCode) {
				return false;
			}
		}
	} else {
		var canTranslate = true;
	}
	
	// Test with JavaScript if available and didn't have a regular expression or
	// passed regular expression test
	if(!translator.target || canTranslate) {
	  	// parse the detect code and execute
		this._parseDetectCode(translator);
		
		if(this.type == "import") {
			try {
				this._importConfigureIO();	// so it can read
			} catch(e) {
				Zotero.debug(e+' in opening IO for '+translator.label);
				return false;
			}
		}
		
		if((this.type == "web" && this._sandbox.detectWeb) ||
		   (this.type == "search" && this._sandbox.detectSearch) ||
		   (this.type == "import" && this._sandbox.detectImport) ||
		   (this.type == "export" && this._sandbox.detectExport)) {
			var returnValue;
			
			try {
				if(this.type == "web") {
					returnValue = this._sandbox.detectWeb(this.document, this.location);
				} else if(this.type == "search") {
					returnValue = this._sandbox.detectSearch(this.search);
				} else if(this.type == "import") {
					returnValue = this._sandbox.detectImport();
				} else if(this.type == "export") {
					returnValue = this._sandbox.detectExport();
				}
			} catch(e) {
				Zotero.debug(e+' in executing detectCode for '+translator.label);
				return false;
			}
			
			Zotero.debug("executed detectCode for "+translator.label);
					
			// detectCode returns text type
			if(returnValue) {
				canTranslate = true;
				
				if(typeof(returnValue) == "string") {
					translator.itemType = returnValue;
				}
			} else {
				canTranslate = false;
			}
		}
	}
	
	return canTranslate;
}

/*
 * parses translator detect code
 */
Zotero.Translate.prototype._parseDetectCode = function(translator) {
	this._configOptions = new Array();
	this._displayOptions = new Array();
	
	if(translator.detectCode) {
		var detectCode = translator.detectCode;
	} else if(!translator.noDetectCode) {
		// get detect code from database
		var detectCode = Zotero.DB.valueQuery("SELECT detectCode FROM translators WHERE translatorID = ?",
		                                       [translator.translatorID]);
	}
	
	if(detectCode) {
		try {
			Components.utils.evalInSandbox(detectCode, this._sandbox);
		} catch(e) {
			Zotero.debug(e+' in parsing detectCode for '+translator.label);
			return;
		}
	}
}

/*
 * sets an option that modifies the way the translator is executed
 * 
 * called as configure() in translator detectCode
 *
 * current options:
 *
 * dataMode
 *   valid: import, export
 *   options: rdf, block, line
 *   purpose: selects whether write/read behave as standard text functions or
 *            using Mozilla's built-in support for RDF data sources
 *
 * getCollections
 *   valid: export
 *   options: true, false
 *   purpose: selects whether export translator will receive an array of
 *            collections and children in addition to the array of items and
 *            children
 */
Zotero.Translate.prototype._configure = function(option, value) {
	this._configOptions[option] = value;
	Zotero.debug("setting configure option "+option+" to "+value);
}

/*
 * adds translator options to be displayed in a dialog
 *
 * called as addOption() in detect code
 *
 * current options are exportNotes and exportFileData
 */
Zotero.Translate.prototype._addOption = function(option, value) {
	this._displayOptions[option] = value;
	Zotero.debug("setting display option "+option+" to "+value);
}

/*
 * gets translator options that were displayed in a dialog
 *
 * called as getOption() in detect code
 *
 */
Zotero.Translate.prototype._getOption = function(option) {
	return this._displayOptions[option];
}

/*
 * makes translation API wait until done() has been called from the translator
 * before executing _translationComplete
 * 
 * called as wait() in translator code
 */
Zotero.Translate.prototype._enableAsynchronous = function() {
	var me = this;
	this._waitForCompletion = true;
	this._sandbox.Zotero.done = function() { me._translationComplete(true) };
}

/*
 * lets user pick which items s/he wants to put in his/her library
 * 
 * called as selectItems() in translator code
 */
Zotero.Translate.prototype._selectItems = function(options) {
	// hack to see if there are options
	var haveOptions = false;
	for(var i in options) {
		haveOptions = true;
		break;
	}
	
	if(!haveOptions) {
		throw "translator called select items with no items";
	}
	
	if(this._handlers.select) {
		return this._runHandler("select", options);
	} else {	// no handler defined; assume they want all of them
		return options;
	}
}

/*
 * executed on translator completion, either automatically from a synchronous
 * scraper or as done() from an asynchronous scraper
 *
 * finishes things up and calls callback function(s)
 */
Zotero.Translate.prototype._translationComplete = function(returnValue, error) {
	// to make sure this isn't called twice
	if(!this._complete) {
		this._complete = true;
		
		if(this.type == "search" && !this._itemsFound && this.translator.length > 1) {
			// if we're performing a search and didn't get any results, go on
			// to the next translator
			Zotero.debug("could not find a result using "+this.translator[0].label+": \n"
			              +this._generateErrorString(error));
			this.translator.shift();
			this.translate();
		} else {
			// close open streams
			this._closeStreams();
			
			if(Zotero.Notifier.isEnabled()) {
				// notify itemTreeView about updates
				if(this.newItems.length) {
					Zotero.Notifier.trigger("add", "item", this.newItems);
				}
				// notify collectionTreeView about updates
				if(this.newCollections && this.newCollections.length) {
					Zotero.Notifier.trigger("add", "collection", this.newCollections);
				}
			}
			
			// call handlers
			this._runHandler("done", returnValue);
			
			if(!returnValue) {
				var errorString = this._generateErrorString(error);
				Zotero.debug("translation using "+this.translator[0].label+" failed: \n"+errorString);
				
				if(this.type == "web") {
					// report translation error for webpages
					this._reportTranslationFailure(errorString);
				}
			} else {
				Zotero.debug("translation successful");
			}
		}
	}
}

/*
 * generates a useful error string, for submitting and debugging purposes
 */
Zotero.Translate.prototype._generateErrorString = function(error) {
	var errorString = "";
	if(typeof(error) == "string") {
		errorString = "\nthrown exception => "+error;
	} else {
		for(var i in error) {
			if(typeof(error[i]) != "object") {
				errorString += "\n"+i+' => '+error[i];
			}
		}
	}
	
	errorString += "\nurl => "+this.path
		+ "\nextensions.zotero.cacheTranslatorData => "+Zotero.Prefs.get("cacheTranslatorData")
		// TODO: Currently using automaticSnapshots pref for everything
		// Eventually downloadAssociatedFiles may be a separate pref
		// for PDFs and other large files
		+ "\nextensions.zotero.downloadAssociatedFiles => "+Zotero.Prefs.get("downloadAssociatedFiles");
		+ "\nextensions.zotero.automaticSnapshots => "+Zotero.Prefs.get("automaticSnapshots");
	return errorString.substr(1);
}

/*
 * runs an HTTP request to report a translation error
 */
Zotero.Translate.prototype._reportTranslationFailure = function(errorData) {
	if(this.translator[0].inRepository && Zotero.Prefs.get("reportTranslationFailure")) {
		var postBody = "ids[]="+escape(this.translator[0].translatorID)+
					   "&lastUpdated="+escape(this.translator[0].lastUpdated)+
					   "&extVersion="+escape(Zotero.version)+
					   "&errorData="+escape(errorData);
		Zotero.Utilities.HTTP.doPost("http://www.zotero.org/repo/report", postBody);
	}
}

/*
 * closes open file streams, if any exist
 */
Zotero.Translate.prototype._closeStreams = function() {
	// serialize RDF and unregister dataSource
	if(this._rdf) {
		if(this._rdf.serializer) {
			this._rdf.serializer.Serialize(this._streams[0]);
		}
		
		try {
			var rdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"].
							 getService(Components.interfaces.nsIRDFService);
			rdfService.UnregisterDataSource(this._rdf.dataSource);
		} catch(e) {}
		
		delete this._rdf.dataSource;
	}
	
	if(this._streams.length) {
		for(var i in this._streams) {
			var stream = this._streams[i];
			
			// stream could be either an input stream or an output stream
			try {
				stream.QueryInterface(Components.interfaces.nsIFileInputStream);
			} catch(e) {
				try {
					stream.QueryInterface(Components.interfaces.nsIFileOutputStream);
				} catch(e) {
				}
			}
			
			// encase close in try block, because it's possible it's already
			// closed
			try {
				stream.close();
			} catch(e) {
			}
		}
	}
	
	delete this._streams;
	this._streams = new Array();
	this._inputStream = null;
}

/*
 * handles tags and see also data for notes and attachments
 */
Zotero.Translate.prototype._itemTagsAndSeeAlso = function(item, newItem) {
	Zotero.debug("handling notes and see also");
	// add to ID map
	if(item.itemID) {
		this._IDMap[item.itemID] = newItem.getID();
	}
	// add see alsos
	for each(var seeAlso in item.seeAlso) {
		if(this._IDMap[seeAlso]) {
			newItem.addSeeAlso(this._IDMap[seeAlso]);
		}
	}
	
	for each(var tag in item.tags) {
		newItem.addTag(tag);
	}
}

/*
 * executed when an item is done and ready to be loaded into the database
 */
Zotero.Translate.prototype._itemDone = function(item, attachedTo) {
	if(this.type == "web") {
		// store repository if this item was captured from a website, and
		// repository is truly undefined (not false or "")
		if(!item.repository && item.repository !== false && item.repository !== "") {
			item.repository = this.translator[0].label;
		}
	}
	
	if(!this.saveItem) {	// if we're not supposed to save the item, just
							// return the item array
		
		// if a parent sandbox exists, use complete() function from that sandbox
		if(this._parentTranslator) {
			var pt = this._parentTranslator;
			item.complete = function() { pt._itemDone(this) };
			Zotero.debug("done from parent sandbox");
		}
		this._runHandler("itemDone", item);
		return;
	}
	
	if(!attachedTo) {
		var notifierStatus = Zotero.Notifier.isEnabled();
		if(notifierStatus) {
			Zotero.Notifier.disable();
		}
	}
	
	try {	// make sure notifier gets turned back on when done
		// Get typeID, defaulting to "webpage"
		var type = (item.itemType ? item.itemType : "webpage");
		
		if(type == "note") {	// handle notes differently
			var myID = Zotero.Notes.add(item.note);
			// re-retrieve the item
			var newItem = Zotero.Items.get(myID);
		} else {
			if(!item.title && this.type == "web") {
				throw("item has no title");
			}
			
			// if item was accessed through a proxy, ensure that the proxy
			// address remains in the accessed version
			if(this.locationIsProxied && item.url) {
				item.url = Zotero.Ingester.ProxyMonitor.properToProxy(item.url);
			}
			
			// create new item
			if(type == "attachment") {
				if(this.type != "import") {
					Zotero.debug("discarding standalone attachment");
					return;
				}
				
				Zotero.debug("adding attachment");
				
				if(!item.path) {
					// create from URL
					if(item.url) {
						var myID = Zotero.Attachments.linkFromURL(item.url, attachedTo,
								(item.mimeType ? item.mimeType : undefined),
								(item.title ? item.title : undefined));
						Zotero.debug("created attachment; id is "+myID);
						if(!myID) {
							// if we didn't get an ID, don't continue adding
							// notes, because we can't without knowing the ID
							return;
						}
						var newItem = Zotero.Items.get(myID);
					} else {
						Zotero.debug("not adding attachment: no path or url specified");
						return;
					}
				} else {
					// generate nsIFile
					var IOService = Components.classes["@mozilla.org/network/io-service;1"].
									getService(Components.interfaces.nsIIOService);
					var uri = IOService.newURI(item.path, "", null);
					var file = uri.QueryInterface(Components.interfaces.nsIFileURL).file;
					
					if(item.url) {
						// import from nsIFile
						var myID = Zotero.Attachments.importSnapshotFromFile(file,
							item.url, item.title, item.mimeType,
							(item.charset ? item.charset : null), attachedTo);
						var newItem = Zotero.Items.get(myID);
					} else {
						// import from nsIFile
						var myID = Zotero.Attachments.importFromFile(file, attachedTo);
						// get attachment item
						var newItem = Zotero.Items.get(myID);
					}
				}
				
				var typeID = Zotero.ItemTypes.getID("attachment");
				
				// add note if necessary
				if(item.note) {
					newItem.updateNote(item.note);
				}
			} else {
				var typeID = Zotero.ItemTypes.getID(type);
				var newItem = Zotero.Items.getNewItemByType(typeID);
			}
			
			// makes looping through easier
			item.itemType = item.complete = undefined;
			
			// automatically set access date if URL is set
			if(item.url && !item.accessDate && this.type == "web") {
				item.accessDate = "CURRENT_TIMESTAMP";
			}
			
			var fieldID, field;
			for(var i in item) {
				// loop through item fields
				data = item[i];
				
				if(data) {						// if field has content
					if(i == "creators") {		// creators are a special case
						for(var j in data) {
							var creatorType = 1;
							// try to assign correct creator type
							if(data[j].creatorType) {
								try {
									var creatorType = Zotero.CreatorTypes.getID(data[j].creatorType);
								} catch(e) {
									Zotero.debug("invalid creator type "+data[j].creatorType+" for creator index "+j);
								}
							}
							
							newItem.setCreator(j, data[j].firstName, data[j].lastName, creatorType);
						}
					} else if(i == "title") {	// skip checks for title
						newItem.setField(i, data);
					} else if(i == "seeAlso") {
						newItem.translateSeeAlso = data;
					} else if(i != "note" && i != "notes" && i != "itemID" &&
							  i != "attachments" && i != "tags" &&
							  (fieldID = Zotero.ItemFields.getID(i))) {
												// if field is in db
						if(Zotero.ItemFields.isValidForType(fieldID, typeID)) {
												// if field is valid for this type
							// add field
							newItem.setField(i, data);
						} else {
							Zotero.debug("discarded field "+i+" for item: field not valid for type "+type);
						}
					} else {
						Zotero.debug("discarded field "+i+" for item: field does not exist");
					}
				}
			}
			
			// save item
			if(myID) {
				newItem.save();
			} else {
				var myID = newItem.save();
				if(myID == true || !myID) {
					myID = newItem.getID();
				}
			}
			
			// handle notes
			if(item.notes) {
				for each(var note in item.notes) {
					var noteID = Zotero.Notes.add(note.note, myID);
					
					// handle see also
					var myNote = Zotero.Items.get(noteID);
					this._itemTagsAndSeeAlso(note, myNote);
				}
			}
			
			// handle attachments
			if(item.attachments && Zotero.Prefs.get("automaticSnapshots")) {
				Zotero.debug("HANDLING ATTACHMENTS");
				for each(var attachment in item.attachments) {
					if(this.type == "web") {
						if(!attachment.url && !attachment.document) {
							Zotero.debug("not adding attachment: no URL specified");
						} else {
							if(attachment.document
							|| (attachment.mimeType && attachment.mimeType == "text/html")
							|| Zotero.Prefs.get("downloadAssociatedFiles")) {
								if(attachment.document) {
									Zotero.Attachments.importFromDocument(attachment.document, myID, attachment.title);
								} else {
									Zotero.debug("GOT ATTACHMENT");
									Zotero.debug(attachment);
									
									var mimeType = null;
									var title = null;
									
									if(attachment.mimeType) {
										// first, try to extract mime type from mimeType attribute
										mimeType = attachment.mimeType;
									} else if(attachment.document && attachment.document.contentType) {
										// if that fails, use document if possible
										mimeType = attachment.document.contentType
									}
									
									// same procedure for title as mime type
									if(attachment.title) {
										title = attachment.title;
									} else if(attachment.document && attachment.document.title) {
										title = attachment.document.title;
									}
									
									Zotero.Attachments.importFromURL(attachment.url, myID, title);
								}
							}
							// links no longer exist, so just don't save them
							/*if(attachment.document) {
								attachmentID = Zotero.Attachments.linkFromURL(attachment.document.location.href, myID,
										(attachment.mimeType ? attachment.mimeType : attachment.document.contentType),
										(attachment.title ? attachment.title : attachment.document.title));
							} else {
								if(!attachment.mimeType || attachment.title) {
									Zotero.debug("notice: either mimeType or title is missing; attaching file will be slower");
								}
								
								attachmentID = Zotero.Attachments.linkFromURL(attachment.url, myID,
										(attachment.mimeType ? attachment.mimeType : undefined),
										(attachment.title ? attachment.title : undefined));
							}*/
						}
					} else if(this.type == "import") {
						// create new attachments attached here
						this._itemDone(attachment, myID);
					}
				}
			}
		}
		
		if(item.itemID) {
			this._IDMap[item.itemID] = myID;
		}
		if(!attachedTo) {
			this.newItems.push(myID);
		}
		
		// handle see also
		if(item.seeAlso) {
			for each(var seeAlso in item.seeAlso) {
				if(this._IDMap[seeAlso]) {
					newItem.addSeeAlso(this._IDMap[seeAlso]);
				}
			}
		}
		
		if(item.tags) {
			for each(var tag in item.tags) {
				newItem.addTag(tag);
			}
		}
		
		delete item;
	} catch(e) {
		if(notifierStatus) {
			Zotero.Notifier.enable();
		}
		throw(e);
	}
	
	// only re-enable if notifier was enabled at the beginning of scraping
	if(!attachedTo) {
		if(notifierStatus) {
			Zotero.Notifier.enable();
		}
		this._runHandler("itemDone", newItem);
	}
}

/*
 * executed when a collection is done and ready to be loaded into the database
 */
Zotero.Translate.prototype._collectionDone = function(collection) {
	var newCollection = this._processCollection(collection, null);
	
	this._runHandler("collectionDone", newCollection);
}

/*
 * recursively processes collections
 */
Zotero.Translate.prototype._processCollection = function(collection, parentID) {
	var newCollection = Zotero.Collections.add(collection.name, parentID);
	var myID = newCollection.getID();
	
	this.newCollections.push(myID);
	
	for each(child in collection.children) {
		if(child.type == "collection") {
			// do recursive processing of collections
			this._processCollection(child, myID);
		} else {
			// add mapped items to collection
			if(this._IDMap[child.id]) {
				Zotero.debug("adding "+this._IDMap[child.id]);
				newCollection.addItem(this._IDMap[child.id]);
			} else {
				Zotero.debug("could not map "+child.id+" to an imported item");
			}
		}
	}
	
	return newCollection;
}

/*
 * calls a handler (see setHandler above)
 */
Zotero.Translate.prototype._runHandler = function(type, argument) {
	var returnValue;
	if(this._handlers[type]) {
		for(var i in this._handlers[type]) {
			Zotero.debug("running handler "+i+" for "+type);
			try {
				if(this._parentTranslator) {
					returnValue = this._handlers[type][i](null, argument);
				} else {
					returnValue = this._handlers[type][i](this, argument);
				}
			} catch(e) {
				if(this._parentTranslator) {
					// throw handler errors if they occur when a translator is
					// called from another translator, so that the
					// "Could Not Translate" dialog will appear if necessary
					throw(e);
				} else {
					// otherwise, fail silently, so as not to interfere with
					// interface cleanup
					Zotero.debug(e+' in handler '+i+' for '+type);
				}
			}
		}
	}
	return returnValue;
}

/*
 * does the actual web translation
 */
Zotero.Translate.prototype._web = function() {
	try {
		this._sandbox.doWeb(this.document, this.location);
	} catch(e) {
		if(this._parentTranslator) {
			throw(e);
		} else {
			this._translationComplete(false, e);
			return false;
		}
	}
	
	return true;
}

/*
 * does the actual search translation
 */
Zotero.Translate.prototype._search = function() {
	try {
		this._sandbox.doSearch(this.search);
	} catch(e) {
		this._translationComplete(false, e);
		return false;
	}
	
	return true;
}

/*
 * does the actual import translation
 */
Zotero.Translate.prototype._import = function() {
	this._importConfigureIO();
	
	try {
		this._sandbox.doImport();
	} catch(e) {
		if(this._parentTranslator) {
			throw(e);
		} else {
			this._translationComplete(false, e);
			return false;
		}
	}
	
	return true;
}

/*
 * sets up import for IO
 */
Zotero.Translate.prototype._importConfigureIO = function() {
	if(this._storage) {
		if(this._configOptions.dataMode == "rdf") {
			this._rdf = new Object();
			
			// read string out of storage stream
			var IOService = Components.classes['@mozilla.org/network/io-service;1']
							.getService(Components.interfaces.nsIIOService);
			this._rdf.dataSource = Components.classes["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"].
							createInstance(Components.interfaces.nsIRDFDataSource);
			var parser = Components.classes["@mozilla.org/rdf/xml-parser;1"].
						 createInstance(Components.interfaces.nsIRDFXMLParser);
			
			// get URI and parse
			var baseURI = (this.location ? IOService.newURI(this.location, "utf-8", null) : null);
			parser.parseString(this._rdf.dataSource, baseURI, this._storage);
			
			// make an instance of the RDF handler
			this._sandbox.Zotero.RDF = new Zotero.Translate.RDF(this._rdf.dataSource);
		} else {
			this._storageFunctions(true);
			this._storagePointer = 0;
		}
	} else {
		var me = this;
		
		if(this._configOptions.dataMode == "rdf") {
			if(!this._rdf) {
				this._rdf = new Object()
				
				var IOService = Components.classes['@mozilla.org/network/io-service;1']
								.getService(Components.interfaces.nsIIOService);
				var fileHandler = IOService.getProtocolHandler("file")
								  .QueryInterface(Components.interfaces.nsIFileProtocolHandler);
				var URL = fileHandler.getURLSpecFromFile(this.location);
				
				var RDFService = Components.classes['@mozilla.org/rdf/rdf-service;1']
								 .getService(Components.interfaces.nsIRDFService);
				this._rdf.dataSource = RDFService.GetDataSourceBlocking(URL);
				
				// make an instance of the RDF handler
				this._sandbox.Zotero.RDF = new Zotero.Translate.RDF(this._rdf.dataSource);
			}
		} else {
			// open file and set read methods
			if(this._inputStream) {
				this._inputStream.QueryInterface(Components.interfaces.nsISeekableStream)
				             .seek(Components.interfaces.nsISeekableStream.NS_SEEK_SET, 0);
				this._inputStream.QueryInterface(Components.interfaces.nsIFileInputStream);
			} else {
				this._inputStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
										  .createInstance(Components.interfaces.nsIFileInputStream);
				this._inputStream.init(this.location, 0x01, 0664, 0);
				this._streams.push(this._inputStream);
			}
			
			var filePosition = 0;
			var intlStream = this._importDefuseBOM();
			if(intlStream) {
				// found a UTF BOM at the beginning of the file; don't allow
				// translator to set the character set
				this._sandbox.Zotero.setCharacterSet = function() {}
			} else {
				// allow translator to set charset
				this._sandbox.Zotero.setCharacterSet = function(charset) {
					// seek
					if(filePosition != 0) {
						me._inputStream.QueryInterface(Components.interfaces.nsISeekableStream)
									 .seek(Components.interfaces.nsISeekableStream.NS_SEEK_SET, filePosition);
						me._inputStream.QueryInterface(Components.interfaces.nsIFileInputStream);
					}
					
					intlStream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
										   .createInstance(Components.interfaces.nsIConverterInputStream);
					try {
						intlStream.init(me._inputStream, charset, 1024,
							Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
					} catch(e) {
						throw "Text encoding not supported";
					}
					me._streams.push(intlStream);
				}
			}
			
			var str = new Object();
			if(this._configOptions.dataMode == "line") {	// line by line reading	
				this._inputStream.QueryInterface(Components.interfaces.nsILineInputStream);
				
				this._sandbox.Zotero.read = function() {
					if(intlStream && intlStream instanceof Components.interfaces.nsIUnicharLineInputStream) {	
						Zotero.debug("using intlStream");
						var amountRead = intlStream.readLine(str);
					} else {
						var amountRead = me._inputStream.readLine(str);
					}
					if(amountRead) {
						filePosition += amountRead;
						return str.value;
					} else {
						return false;
					}
				}
			} else {										// block reading
				var sStream;
				
				this._sandbox.Zotero.read = function(amount) {
					if(intlStream) {
						// read from international stream, if one is available
						var amountRead = intlStream.readString(amount, str);
						
						if(amountRead) {
							filePosition += amountRead;
							return str.value;
						} else {
							return false;
						}
					} else {
						// allocate sStream on the fly
						if(!sStream) {
							sStream = Components.classes["@mozilla.org/scriptableinputstream;1"]
										 .createInstance(Components.interfaces.nsIScriptableInputStream);
							sStream.init(me._inputStream);
						}
						
						// read from the scriptable input stream
						var string = sStream.read(amount);
						filePosition += string.length;
						return string;
					}
				}
				
				// attach sStream to stack of streams to close
				this._streams.push(sStream);
			}
		}
	}
}

/*
 * searches for a UTF BOM at the beginning of the input stream. if one is found,
 * returns an appropriate converter-input-stream for the UTF type, and sets
 * _hasBOM to the UTF type.  if one is not found, returns false, and sets
 * _hasBOM to false to prevent further checking.
 */
Zotero.Translate.prototype._importDefuseBOM = function() {
	// if already found not to have a BOM, skip
	if(this._hasBOM === false) {
		return;
	}
	
	if(!this._hasBOM) {
		// if not checked for a BOM, open a binary input stream and read
		var binStream = Components.classes["@mozilla.org/binaryinputstream;1"].
		                           createInstance(Components.interfaces.nsIBinaryInputStream);
		binStream.setInputStream(this._inputStream);
		
		// read the first byte
		var byte1 = binStream.read8();
		
		// at the moment, we don't support UTF-32 or UTF-7. while mozilla
		// supports these encodings, they add slight additional complexity to
		// the function and anyone using them for storing bibliographic metadata
		// is insane.
		if(byte1 == 0xEF) {			// UTF-8: EF BB BF
			var byte2 = binStream.read8();
			if(byte2 == 0xBB) {
				var byte3 = binStream.read8();
				if(byte3 == 0xBF) {
					this._hasBOM = "UTF-8";
				}
			}
		} else if(byte1 == 0xFE) {	// UTF-16BE: FE FF
			var byte2 = binStream.read8();
			if(byte2 == 0xFF) {
				this._hasBOM = "UTF-16BE";
			}
		} else if(byte1 == 0xFF) {	// UTF-16LE: FF FE
			var byte2 = binStream.read8();
			if(byte2 == 0xFE) {
				this._hasBOM = "UTF16-LE";
			}
		}
		
		if(!this._hasBOM) {
			// seek back to begining of file
			this._inputStream.QueryInterface(Components.interfaces.nsISeekableStream)
						     .seek(Components.interfaces.nsISeekableStream.NS_SEEK_SET, 0);
			this._inputStream.QueryInterface(Components.interfaces.nsIFileInputStream);
			
			// say there's no BOM
			this._hasBOM = false;
			
			return false;
		}
	} else {
		// if it had a BOM the last time, it has one this time, too. seek to the
		// correct position.
		
		if(this._hasBOM == "UTF-8") {
			var seekPosition = 3;
		} else {
			var seekPosition = 2;
		}
		
		this._inputStream.QueryInterface(Components.interfaces.nsISeekableStream)
					     .seek(Components.interfaces.nsISeekableStream.NS_SEEK_SET, seekPosition);
		this._inputStream.QueryInterface(Components.interfaces.nsIFileInputStream);
	}
	
	// if we know what kind of BOM it has, generate an input stream	
	intlStream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
						   .createInstance(Components.interfaces.nsIConverterInputStream);
	intlStream.init(this._inputStream, this._hasBOM, 1024,
		Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
	return intlStream;
}

/*
 * does the actual export, after code has been loaded and parsed
 */
Zotero.Translate.prototype._export = function() {
	
	// get items
	if(this.items) {
		this._itemsLeft = this.items;
	} else {
		this._itemsLeft = Zotero.getItems();
	}
	
	// run handler for items available
	this._runHandler("itemCount", this._itemsLeft.length);
	
	// get collections, if requested
	if(this._configOptions.getCollections && !this.items) {
		this._collectionsLeft = Zotero.getCollections();
	}
	
	Zotero.debug(this._displayOptions);
	
	// export file data, if requested
	if(this._displayOptions["exportFileData"]) {
		// generate directory
		var directory = Components.classes["@mozilla.org/file/local;1"].
		                createInstance(Components.interfaces.nsILocalFile);
		directory.initWithFile(this.location.parent);
		
		// delete this file if it exists
		if(this.location.exists()) {
			this.location.remove(false);
		}
		
		// get name
		var name = this.location.leafName;
		directory.append(name);
		
		// create directory
		directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0700);
		
		// generate a new location for the exported file, with the appropriate
		// extension
		this.location = Components.classes["@mozilla.org/file/local;1"].
		                createInstance(Components.interfaces.nsILocalFile);
		this.location.initWithFile(directory);
		this.location.append(name+"."+this.translator[0].target);
		
		// create files directory
		this._exportFileDirectory = Components.classes["@mozilla.org/file/local;1"].
		                            createInstance(Components.interfaces.nsILocalFile);
		this._exportFileDirectory.initWithFile(directory);
		this._exportFileDirectory.append("files");
		this._exportFileDirectory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0700);
	}
	
	// configure IO
	this._exportConfigureIO();
	
	try {
		this._sandbox.doExport();
	} catch(e) {
		this._translationComplete(false, e);
		return false;
	}
	
	return true;
}

/*
 * configures IO for export
 */
Zotero.Translate.prototype._exportConfigureIO = function() {
	// open file
	var fStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
							 .createInstance(Components.interfaces.nsIFileOutputStream);
	fStream.init(this.location, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
	// attach to stack of streams to close at the end
	this._streams.push(fStream);
	
	if(this._configOptions.dataMode == "rdf") {	// rdf io
		this._rdf = new Object();
		
		// create data source
		this._rdf.dataSource = Components.classes["@mozilla.org/rdf/datasource;1?name=xml-datasource"].
		                 createInstance(Components.interfaces.nsIRDFDataSource);
		// create serializer
		this._rdf.serializer = Components.classes["@mozilla.org/rdf/xml-serializer;1"].
		                 createInstance(Components.interfaces.nsIRDFXMLSerializer);
		this._rdf.serializer.init(this._rdf.dataSource);
		this._rdf.serializer.QueryInterface(Components.interfaces.nsIRDFXMLSource);
		
		// make an instance of the RDF handler
		this._sandbox.Zotero.RDF = new Zotero.Translate.RDF(this._rdf.dataSource, this._rdf.serializer);
	} else {
		// regular io; write just writes to file
		var intlStream = null;
		
		// allow setting of character sets
		this._sandbox.Zotero.setCharacterSet = function(charset) {
			intlStream = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
			                       .createInstance(Components.interfaces.nsIConverterOutputStream);
			intlStream.init(fStream, charset, 1024, "?".charCodeAt(0));
		};
		
		this._sandbox.Zotero.write = function(data) {
			if(intlStream) {
				intlStream.writeString(data);
			} else {
				fStream.write(data, data.length);
			}
		};
	}
}

/*
 * copies attachment and returns data, given an attachment object
 */
Zotero.Translate.prototype._exportGetAttachment = function(attachment) {
	var attachmentArray = attachment.toArray();
	
	var attachmentID = attachment.getID();
	var linkMode = attachment.getAttachmentLinkMode();
	
	// get URL and accessDate if they exist
	if(linkMode == Zotero.Attachments.LINK_MODE_LINKED_URL ||
	   linkMode == Zotero.Attachments.LINK_MODE_IMPORTED_URL) {
		attachmentArray.url = attachment.getField('url');
		attachmentArray.accessDate = attachment.getField('accessDate');
	} else if(!this._displayOptions["exportFileData"]) {
		// only export urls, not files, if exportFileData is off
		return false;
	}
	// add item ID
	attachmentArray.itemID = attachmentID;
	// get mime type
	attachmentArray.mimeType = attachment.getAttachmentMimeType();
	// get charset
	attachmentArray.charset = attachment.getAttachmentCharset();
	// get seeAlso
	attachmentArray.seeAlso = attachment.getSeeAlso();
	// get tags
	attachmentArray.tags = attachment.getTags();
	
	if(linkMode != Zotero.Attachments.LINK_MODE_LINKED_URL &&
	   this._displayOptions["exportFileData"]) {
		// add path and filename if not an internet link
		var file = attachment.getFile();
		attachmentArray.path = "files/"+attachmentID+"/"+file.leafName;
		
		if(linkMode == Zotero.Attachments.LINK_MODE_LINKED_FILE) {
			// create a new directory
			var directory = Components.classes["@mozilla.org/file/local;1"].
							createInstance(Components.interfaces.nsILocalFile);
			directory.initWithFile(this._exportFileDirectory);
			directory.append(attachmentID);
			directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0700);
			// copy file
			file.copyTo(directory, attachmentArray.filename);
		} else {
			// copy imported files from the Zotero directory
			var directory = Zotero.getStorageDirectory();
			directory.append(attachmentID);
			directory.copyTo(this._exportFileDirectory, attachmentID);
		}
	}
	
	attachmentArray.itemType = "attachment";
	
	return attachmentArray;
}

/*
 * gets the next item to process (called as Zotero.nextItem() from code)
 */
Zotero.Translate.prototype._exportGetItem = function() {
	if(this._itemsLeft.length != 0) {
		var returnItem = this._itemsLeft.shift();
		// export file data for single files
		if(returnItem.isAttachment()) {		// an independent attachment
			var returnItemArray = this._exportGetAttachment(returnItem);
			if(returnItemArray) {
				return returnItemArray;
			} else {
				return this._exportGetItem();
			}
		} else {
			var returnItemArray = returnItem.toArray();
			// get attachments, although only urls will be passed if exportFileData
			// is off
			returnItemArray.attachments = new Array();
			var attachments = returnItem.getAttachments();
			for each(attachmentID in attachments) {
				var attachment = Zotero.Items.get(attachmentID);
				var attachmentInfo = this._exportGetAttachment(attachment);
				
				if(attachmentInfo) {
					returnItemArray.attachments.push(attachmentInfo);
				}
			}
		}
		
		this._runHandler("itemDone", returnItem);
		
		return returnItemArray;
	}
	
	return false;
}

/*
 * gets the next item to collection (called as Zotero.nextCollection() from code)
 */
Zotero.Translate.prototype._exportGetCollection = function() {
	if(!this._configOptions.getCollections) {
		throw("getCollections configure option not set; cannot retrieve collection");
	}
	
	if(this._collectionsLeft && this._collectionsLeft.length != 0) {
		var returnItem = this._collectionsLeft.shift();
		var collection = new Object();
		collection.id = returnItem.getID();
		collection.name = returnItem.getName();
		collection.type = "collection";
		collection.children = returnItem.toArray();
		
		return collection;
	}
}

/*
 * sets up internal IO in such a way that both reading and writing are possible
 * (for inter-scraper communications)
 */
Zotero.Translate.prototype._initializeInternalIO = function() {
	if(this.type == "import" || this.type == "export") {
		if(this._configOptions.dataMode == "rdf") {
			this._rdf = new Object();
			// use an in-memory data source for internal IO
			this._rdf.dataSource = Components.classes["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"].
							 createInstance(Components.interfaces.nsIRDFDataSource);
			
			// make an instance of the RDF handler
			this._sandbox.Zotero.RDF = new Zotero.Translate.RDF(this._rdf.dataSource);
		} else {
			this._storage = "";
			this._storageLength = 0;
			this._storagePointer = 0;
			this._storageFunctions(true, true);
		}
	}
}

/*
 * sets up functions for reading/writing to a storage stream
 */
Zotero.Translate.prototype._storageFunctions =  function(read, write) {
	var me = this;
	
	// add setCharacterSet method that does nothing
	this._sandbox.Zotero.setCharacterSet = function() {}
	
	if(write) {
		// set up write() method
		this._sandbox.Zotero.write = function(data) {
			me._storage += data;
			me._storageLength += data.length;
		};		
	}
	
	if(read) {
		// set up read methods
		if(this._configOptions.dataMode == "line") {	// line by line reading
			var lastCharacter;
			
			this._sandbox.Zotero.read = function() {
				if(me._storagePointer >= me._storageLength) {
					return false;
				}
				
				var oldPointer = me._storagePointer;
				var lfIndex = me._storage.indexOf("\n", me._storagePointer);
				
				if(lfIndex != -1) {
					// in case we have a CRLF
					me._storagePointer = lfIndex+1;
					if(me._storageLength > lfIndex && me._storage[lfIndex-1] == "\r") {
						lfIndex--;
					}
					return me._storage.substr(oldPointer, lfIndex-oldPointer);					
				}
				
				var crIndex = me._storage.indexOf("\r", me._storagePointer);
				if(crIndex != -1) {
					me._storagePointer = crIndex+1;
					return me._storage.substr(oldPointer, crIndex-oldPointer-1);
				}
				
				me._storagePointer = me._storageLength;
				return me._storage;
			}
		} else {									// block reading
			this._sandbox.Zotero.read = function(amount) {
				if(me._storagePointer >= me._storageLength) {
					return false;
				}
				
				if((me._storagePointer+amount) > me._storageLength) {
					var oldPointer = me._storagePointer;
					me._storagePointer = me._storageLength+1;
					return me._storage.substr(oldPointer);
				}
				
				var oldPointer = me._storagePointer;
				me._storagePointer += amount;
				return me._storage.substr(oldPointer, amount);
			}
		}
	}
}

/* Zotero.Translate.ZoteroItem: a class for generating a new item from
 * inside scraper code
 */
 
Zotero.Translate.GenerateZoteroItemClass = function() {
	var ZoteroItem = function(itemType) {
		// assign item type
		this.itemType = itemType;
		// generate creators array
		this.creators = new Array();
		// generate notes array
		this.notes = new Array();
		// generate tags array
		this.tags = new Array();
		// generate see also array
		this.seeAlso = new Array();
		// generate file array
		this.attachments = new Array();
	};
	
	return ZoteroItem;
}

/* Zotero.Translate.Collection: a class for generating a new top-level
 * collection from inside scraper code
 */

Zotero.Translate.GenerateZoteroCollectionClass = function() {
	var ZoteroCollection = Zotero.Translate.ZoteroCollection = function() {};
	
	return ZoteroCollection;
}

/* Zotero.Translate.RDF: a class for handling RDF IO
 *
 * If an import/export translator specifies dataMode RDF, this is the interface,
 * accessible from model.
 * 
 * In order to simplify things, all classes take in their resource/container
 * as either the Mozilla native type or a string, but all
 * return resource/containers as Mozilla native types (use model.toString to
 * convert)
 */

Zotero.Translate.RDF = function(dataSource, serializer) {
	this._RDFService = Components.classes['@mozilla.org/rdf/rdf-service;1']
					 .getService(Components.interfaces.nsIRDFService);
	this._AtomService = Components.classes["@mozilla.org/atom-service;1"]
					 .getService(Components.interfaces.nsIAtomService);
	this._RDFContainerUtils = Components.classes["@mozilla.org/rdf/container-utils;1"]
							.getService(Components.interfaces.nsIRDFContainerUtils);
	
	this._dataSource = dataSource;
	this._serializer = serializer;
}

// turn an nsISimpleEnumerator into an array
Zotero.Translate.RDF.prototype._deEnumerate = function(enumerator) {
	if(!(enumerator instanceof Components.interfaces.nsISimpleEnumerator)) {
		return false;
	}
	
	var resources = new Array();
	
	while(enumerator.hasMoreElements()) {
		var resource = enumerator.getNext();
		try {
			resource.QueryInterface(Components.interfaces.nsIRDFLiteral);
			resources.push(resource.Value);
		 } catch(e) {
			resource.QueryInterface(Components.interfaces.nsIRDFResource);
			resources.push(resource);
		 }
	}
	
	if(resources.length) {
		return resources;
	} else {
		return false;
	}
}

// get a resource as an nsIRDFResource, instead of a string
Zotero.Translate.RDF.prototype._getResource = function(about) {
	try {
		if(!(about instanceof Components.interfaces.nsIRDFResource)) {
			about = this._RDFService.GetResource(about);
		}
	} catch(e) {
		throw("Zotero.Translate.RDF.addStatement: Invalid RDF resource: "+about);
	}
	return about;
}

// USED FOR OUTPUT

// writes an RDF triple
Zotero.Translate.RDF.prototype.addStatement = function(about, relation, value, literal) {
	about = this._getResource(about);
	
	if(!(value instanceof Components.interfaces.nsIRDFResource)) {
		if(literal) {
			try {
				value = this._RDFService.GetLiteral(value);
			} catch(e) {
				Zotero.debug(value);
				throw "Zotero.Translate.RDF.addStatement: Could not convert to literal";
			}
		} else {
			try {
				value = this._RDFService.GetResource(value);
			} catch(e) {
				Zotero.debug(value);
				throw "Zotero.Translate.RDF.addStatement: Could not convert to resource";
			}
		}
	}
	
	this._dataSource.Assert(about, this._RDFService.GetResource(relation), value, true);
}
		
// creates an anonymous resource
Zotero.Translate.RDF.prototype.newResource = function() {
	return this._RDFService.GetAnonymousResource()
};
		
// creates a new container
Zotero.Translate.RDF.prototype.newContainer = function(type, about) {
	about = this._getResource(about);
	
	type = type.toLowerCase();
	if(type == "bag") {
		return this._RDFContainerUtils.MakeBag(this._dataSource, about);
	} else if(type == "seq") {
		return this._RDFContainerUtils.MakeSeq(this._dataSource, about);
	} else if(type == "alt") {
		return this._RDFContainerUtils.MakeAlt(this._dataSource, about);
	} else {
		throw "Invalid container type in model.newContainer";
	}
}

// adds a new container element (index optional)
Zotero.Translate.RDF.prototype.addContainerElement = function(about, element, literal, index) {
	if(!(about instanceof Components.interfaces.nsIRDFContainer)) {
		about = this._getResource(about);
		var container = Components.classes["@mozilla.org/rdf/container;1"].
						createInstance(Components.interfaces.nsIRDFContainer);
		container.Init(this._dataSource, about);
		about = container;
	}
	if(!(element instanceof Components.interfaces.nsIRDFResource)) {
		if(literal) {
			element = this._RDFService.GetLiteral(element);
		} else {
			element = this._RDFService.GetResource(element);
		}
	}
	
	if(index) {
		about.InsertElementAt(element, index, true);
	} else {
		about.AppendElement(element);
	}
}

// gets container elements as an array
Zotero.Translate.RDF.prototype.getContainerElements = function(about) {
	if(!(about instanceof Components.interfaces.nsIRDFContainer)) {
		about = this._getResource(about);
		var container = Components.classes["@mozilla.org/rdf/container;1"].
						createInstance(Components.interfaces.nsIRDFContainer);
		container.Init(this._dataSource, about);
		about = container;
	}
	
	return this._deEnumerate(about.GetElements());
}

// sets a namespace
Zotero.Translate.RDF.prototype.addNamespace = function(prefix, uri) {
	if(this._serializer) {	// silently fail, in case the reason the scraper
							// is failing is that we're using internal IO
		this._serializer.addNameSpace(this._AtomService.getAtom(prefix), uri);
	}
}

// gets a resource's URI
Zotero.Translate.RDF.prototype.getResourceURI = function(resource) {
	if(typeof(resource) == "string") {
		return resource;
	}
	
	resource.QueryInterface(Components.interfaces.nsIRDFResource);
	return resource.ValueUTF8;
}

// USED FOR INPUT

// gets all RDF resources
Zotero.Translate.RDF.prototype.getAllResources = function() {
	var resourceEnumerator = this._dataSource.GetAllResources();
	return this._deEnumerate(resourceEnumerator);
}

// gets arcs going in
Zotero.Translate.RDF.prototype.getArcsIn = function(resource) {
	resource = this._getResource(resource);
	
	var arcEnumerator = this._dataSource.ArcLabelsIn(resource);
	return this._deEnumerate(arcEnumerator);
}

// gets arcs going out
Zotero.Translate.RDF.prototype.getArcsOut = function(resource) {
	resource = this._getResource(resource);
	
	var arcEnumerator = this._dataSource.ArcLabelsOut(resource);
	return this._deEnumerate(arcEnumerator);
}

// gets source resources
Zotero.Translate.RDF.prototype.getSources = function(resource, property) {
	property = this._getResource(property);
	resource = this._getResource(resource);
	
	var enumerator = this._dataSource.GetSources(property, resource, true);
	return this._deEnumerate(enumerator);
}

// gets target resources
Zotero.Translate.RDF.prototype.getTargets = function(resource, property) {
	property = this._getResource(property);
	resource = this._getResource(resource);
	
	var enumerator = this._dataSource.GetTargets(resource, property, true);
	return this._deEnumerate(enumerator);
}