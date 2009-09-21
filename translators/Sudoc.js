{
	"translatorID":"1b9ed730-69c7-40b0-8a06-517a89a3a278",
	"translatorType":4,
	"label":"Sudoc",
	"creator":"Sean Takats and Michael Berkowitz, updated by Sylvain Machefert",
	"target":"^http://(www|corail)\\.sudoc\\.abes\\.fr",
	"minVersion":"1.0.0b3.r1",
	"maxVersion":"",
	"priority":100,
	"inRepository":true,
	"lastUpdated":"2009-09-03 17:00:00"
}


function detectWeb(doc, url) {
		var namespace = doc.documentElement.namespaceURI;
		var nsResolver = namespace ? function(prefix) {
				if (prefix == 'x') return namespace; else return null;
		} : null;

		var multxpath = '/html/body/div[2]/div/span';
		if (elt = doc.evaluate(multxpath, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext()) {
				var content = elt.textContent;
				if ( (content == "Résultats") || (content == "Results") )
				{
					return "multiple";	
				}
				else if ( (content == "Notice complète") || (content == "title data") )
				{
					var xpathimage = '/html/body/div[2]/div[4]/span/img';
					if (elt = doc.evaluate(xpathimage, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext())
					{
						var type = elt.getAttribute('src');
						if (type.indexOf('article.gif') > 0)
						{
							return "journalArticle";
						}
						else if (type.indexOf('book.gif') > 0)
						{
							return "book";
						}
						else if (type.indexOf('handwriting.gif') > 0)
						{
							return "manuscript";
						}
						else if (type.indexOf('sons.gif') > 0)
						{
							return "audioRecording";
						}
						else if (type.indexOf('sound.gif') > 0)
						{
							return "audioRecording";
						}
						else if (type.indexOf('thesis.gif') > 0)
						{
							return "thesis";
						}
						else if (type.indexOf('map.gif') > 0)
						{
							return "map";
						}
						else
						{
							return "book";
						}
					}
				}
		}
}

function scrape(doc) {
		var namespace = doc.documentElement.namespaceURI;
		var nsResolver = namespace ? function(prefix) {
				if (prefix == 'x') return namespace; else return null;
		} : null;
		
		var zXpath = '/html/body/span[@class="Z3988"]';
		var eltCoins = doc.evaluate(zXpath, doc, nsResolver, XPathResult.ANY_TYPE, null);
		if (eltCoins = doc.evaluate(zXpath, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext())
		{
			var coins = eltCoins.getAttribute('title');

			var newItem = new Zotero.Item();
			newItem.repository = false;	// do not save repository
			if(Zotero.Utilities.parseContextObject(coins, newItem)) 
			{
				if (newItem.title) 
				{
					// We use the same method as in detectWeb to find 
					// the real type of document
					var xpathimage = '/html/body/div[2]/div[4]/span/img';
					if (elt = doc.evaluate(xpathimage, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext())
					{
						var type = elt.getAttribute('src');
						var ZoteroType = '';
						if (type.indexOf('article.gif') > 0)
						{
							zoteroType = 'journalArticle';
						}
						else if (type.indexOf('book.gif') > 0)
						{
							zoteroType = 'book';
						}
						else if (type.indexOf('handwriting.gif') > 0)
						{
							zoteroType = 'manuscript';
						}
						else if (type.indexOf('sons.gif') > 0)
						{
							zoteroType = "audioRecording";
						}
						else if (type.indexOf('sound.gif') > 0)
						{
							zoteroType = "audioRecording";
						}
						else if (type.indexOf('thesis.gif') > 0)
						{
							zoteroType = "thesis";
						}
						else if (type.indexOf('map.gif') > 0)
						{
							zoteroType = "map";
						}
						else
						{
							zoteroType = "book";
						}
						newItem.itemType = zoteroType;
					}
					
					// 	We need to correct some informations where COinS is wrong
					var rowXpath = '//tr[td[@class="rec_lable"]]';
					var tableRows = doc.evaluate(rowXpath, doc, nsResolver, XPathResult.ANY_TYPE, null);
					var tableRow;
					
					while (tableRow = tableRows.iterateNext())
					{
						var field = doc.evaluate('./td[1]', tableRow, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().textContent;
						var value = doc.evaluate('./td[2]', tableRow, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().textContent;
						field = Zotero.Utilities.superCleanString(field);
						field = field.replace(/(\(s\))?\s*:\s*$/, "");

						// With COins, only one author is taken, changed.
						if (field.substr(0,6) == "Auteur" || field.substr(0,6) == "Author")
						{
							var authors = doc.evaluate('./td[2]/div', tableRow, nsResolver, XPathResult.ANY_TYPE, null);
							newItem.creators = new Array();
							while (author = authors.iterateNext())
							{
								var authorText = author.textContent;
								
								authorFunction = authorText.split(". ")[1];
								authorText = authorText.split(". ")[0];
								if (authorFunction)
								{
									authorFunction = Zotero.Utilities.superCleanString(authorFunction);
								}
								var zoteroFunction = '';
								// TODO : Add other authotiry types
								if (authorFunction == 'Traduction')
								{
									zoteroFunction = 'Translator';
								}
								else
								{
									zoteroFunction = 'Author';
								}
								newItem.creators.push(Zotero.Utilities.cleanAuthor(authorText, zoteroFunction, true));
							}
						}
						// The serie isn't in COinS
						else 	if (field.substr(0,5) == "Serie" || field.substr(0,10) == "Collection")
						{
							newItem.series = value;	
						}
						// When there's a subtitle, only main title is used !
						else if (field == "Titre" || field == "Title")
						{
							var title = '';
							var titles = doc.evaluate('./td[2]/div/span', tableRow, nsResolver, XPathResult.ANY_TYPE, null);
							while (partTitle = titles.iterateNext())
							{
								partTitle = partTitle.textContent;
								partTitle = partTitle.replace(/(\[[^\]]+\] ?)/g,"");
								title = title + partTitle;
							}
							// Remove the author
							title = title.split(" / ")[0];
							newItem.title = title;
						}
						// Language not defined in COinS
						else if ( (field == "Langue") || (field == "Language") )
						{
							newItem.language = value;
						}
						else if ( (field == "Résumé") || (field == "Abstract") )
						{
							if (newItem.abstractNote)
							{
								newItem.abstractNote = newItem.abstractNote + " " + value;
							}
							else
							{
								newItem.abstractNote = value;
							}

						}
						else if (field == "Notes")
						{
							if (newItem.abstractNote)
							{
								newItem.abstractNote = newItem.abstractNote + " " + value;
							}
							else
							{
								newItem.abstractNote = value;
							}
						}
					}
					newItem.complete();
				}
			}
		}
}

function doWeb(doc, url) {
		var namespace = doc.documentElement.namespaceURI;
		var nsResolver = namespace ? function(prefix) {
				if (prefix == 'x') return namespace; else return null;
		} : null;
		
		var multxpath = '/html/body/div[2]/div/span';
		if (elt = doc.evaluate(multxpath, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext()) {
				var content = elt.textContent;
				if ( (content == "Résultats") || (content == "Results") )
				{
					var newUrl = doc.evaluate('//base/@href', doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().nodeValue;
					var xpath = '/html/body/div[2]/table/tbody/tr/td[3]/div/a';
					var elmts = doc.evaluate(xpath, doc, nsResolver, XPathResult.ANY_TYPE, null);
					var elmt = elmts.iterateNext();
					var links = new Array();
					var availableItems = new Array();
					var i = 0;
					do {
						var link = doc.evaluate('./@href', elmt, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().nodeValue;
						var searchTitle = elmt.textContent;
						availableItems[i] = searchTitle;
						links[i] = link;
						i++;
					} while (elmt = elmts.iterateNext());
					var items = Zotero.selectItems(availableItems);

					if(!items) {
						return true;
					}
					
					var uris = new Array();
					for(var i in items) {
							uris.push(newUrl + links[i]);
							Zotero.debug(newUrl + links[i]);
					}
					Zotero.Utilities.processDocuments(uris, function(doc) { scrape(doc) },
							function() { Zotero.done(); }, null);
					Zotero.wait();		
				}
				else if ( (content == "Notice complète") || (content == 'title data') )
				{
					scrape(doc);
				}
		}
}
