{
	"translatorID":"3e684d82-73a3-9a34-095f-19b112d88bbf",
	"translatorType":4,
	"label":"Google Books",
	"creator":"Simon Kornblith, Michael Berkowitz and Rintze Zelle",
	"target":"^http://(books|www)\\.google\\.[a-z]+(\\.[a-z]+)?/books\\?(.*id=.*|.*q=.*)",
	"minVersion":"1.0.0b3.r1",
	"maxVersion":"",
	"priority":100,
	"inRepository":true,
	"lastUpdated":"2009-06-04 01:10:00"
}


function detectWeb(doc, url) {
	var re = new RegExp('^http://(books|www)\\.google\\.[a-z]+(\.[a-z]+)?/books\\?id=([^&]+)', 'i');
	if(re.test(doc.location.href)) {
		return "book";
	} else {
		return "multiple";
	}
}
function doWeb(doc, url) {
	var namespace = doc.documentElement.namespaceURI;
	var nsResolver = namespace ? function(prefix) {
		if (prefix == 'x') return namespace; else return null;
		} : null;
	
	// get local domain suffix
	var psRe = new RegExp("https?://(books|www)\.google\.([^/]+)/");
	var psMatch = psRe.exec(url);
	var suffix = psMatch[2];
	var prefix = psMatch[1];
	var uri = doc.location.href;
	var newUris = new Array();
	
	var re = new RegExp('^http://(?:books|www)\\.google\\.[a-z]+(\.[a-z]+)?/books\\?id=([^&]+)', 'i');
	var m = re.exec(uri);
	if(m) {
		newUris.push("http://books.google.com/books/feeds/volumes/"+m[2]);
	} else {
		var items = getItemArrayGB(doc, doc, 'http://'+prefix+'\\.google\\.' + suffix + '/books\\?id=([^&]+)', '^(?:All matching pages|About this Book|Table of Contents|Index)');
		// Drop " - Page" thing
		for(var i in items) {
			items[i] = items[i].replace(/- Page [0-9]+\s*$/, "");
		}
		items = Zotero.selectItems(items);
		
		if(!items) {
			return true;
		}
		
		for(var i in items) {
			var m = re.exec(i);
			newUris.push("http://books.google.com/books/feeds/volumes/"+m[2]);
		}
	}
	
	var itemUrlBase = "http://"+prefix+".google."+suffix+"/books?id=";
	
	Zotero.Utilities.HTTP.doGet(newUris, function(text) {
		// Remove xml parse instruction and doctype
		text = text.replace(/<!DOCTYPE[^>]*>/, "").replace(/<\?xml[^>]*\?>/, "");

		var xml = new XML(text);
		
		default xml namespace = "http://purl.org/dc/terms"; with ({});
		
		var newItem = new Zotero.Item("book");
		
		var authors = xml.creator;
		for (var i in authors) {
			newItem.creators.push(Zotero.Utilities.cleanAuthor(authors[i].toString(), "author"));
		}
		
		newItem.date = xml.date.toString();
		
		var pages = xml.format.toString();
		var pagesRe = new RegExp(/(\d+)( pages)/);
		var pagesMatch = pagesRe.exec(pages);
		if (pagesMatch!=null) {
			newItem.pages = pagesMatch[1];
		} else {
			newItem.pages = pages;
		}
		
		var ISBN;
		var identifiers = xml.identifier;
		var identifiersRe = new RegExp(/(ISBN:)(\w+)/);
		for (var i in identifiers) {
			var identifierMatch = identifiersRe.exec(identifiers[i].toString());
			if (identifierMatch!=null && !ISBN) {
				ISBN = identifierMatch[2];
			} else if (identifierMatch!=null){
				ISBN = ISBN + ", " + identifierMatch[2];
			}
		}
		newItem.ISBN = ISBN;
		
		newItem.publisher = xml.publisher[0].toString();
		
		newItem.title = xml.title[0].toString();
		
		var url = itemUrlBase + xml.identifier[0];
		newItem.attachments = [{title:"Google Books Link", snapshot:false, mimeType:"text/html", url:url}];
		
		newItem.complete();
	}, function() { Zotero.done(); }, null);
	Zotero.wait();
}

/**
 * Grabs items based on URLs
 *
 * @param {Document} doc DOM document object
 * @param {Element|Element[]} inHere DOM element(s) to process
 * @param {RegExp} [urlRe] Regexp of URLs to add to list
 * @param {RegExp} [urlRe] Regexp of URLs to reject
 * @return {Object} Associative array of link => textContent pairs, suitable for passing to
 *	Zotero.selectItems from within a translator
 */
function getItemArrayGB (doc, inHere, urlRe, rejectRe) {
	var availableItems = new Object();	// Technically, associative arrays are objects
	
	// Require link to match this
	if(urlRe) {
		if(urlRe.exec) {
			var urlRegexp = urlRe;
		} else {
			var urlRegexp = new RegExp();
			urlRegexp.compile(urlRe, "i");
		}
	}
	// Do not allow text to match this
	if(rejectRe) {
		if(rejectRe.exec) {
			var rejectRegexp = rejectRe;
		} else {
			var rejectRegexp = new RegExp();
			rejectRegexp.compile(rejectRe, "i");
		}
	}
	
	if(!inHere.length) {
		inHere = new Array(inHere);
	}
	
	for(var j=0; j<inHere.length; j++) {
		var links = inHere[j].getElementsByTagName("a");
		for(var i=0; i<links.length; i++) {
			if(!urlRe || urlRegexp.test(links[i].href)) {
				var text = links[i].textContent;
				//Rintze Zelle: the three lines below are for compatibility with Google Books cover view
				if(!text) {
					var text = links[i].firstChild.alt;
				}
				if(text) {
					text = Zotero.Utilities.trimInternal(text);
					if(!rejectRe || !rejectRegexp.test(text)) {
						if(availableItems[links[i].href]) {
							if(text != availableItems[links[i].href]) {
								availableItems[links[i].href] += " "+text;
							}
						} else {
							availableItems[links[i].href] = text;
						}
					}
				}
			}
		}
	}
	
	return availableItems;
}