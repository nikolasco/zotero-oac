{
	"translatorID":"a1a97ad4-493a-45f2-bd46-016069de4162",
	"translatorType":4,
	"label":"Optical Society of America",
	"creator":"Michael Berkowitz",
	"target":"https?://[^.]+\\.(opticsinfobase|osa)\\.org",
	"minVersion":"1.0.0b4.r1",
	"maxVersion":"",
	"priority":100,
	"inRepository":true,
	"lastUpdated":"2008-07-15 19:40:00"
}

function detectWeb(doc, url) {
	var namespace = doc.documentElement.namespaceURI;
	var nsResolver = namespace ? function(prefix) {
		if (prefix == 'x') return namespace; else return null;
	} : null;
	
	var searchpath = '//div[@id="col2"]/p/strong/a';
	if (doc.evaluate(searchpath, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext()) {
		return "multiple";
	} else if (url.indexOf("abstract.cfm") != -1) {
		return "journalArticle";
	}
}

function doWeb(doc, url) {
	var namespace = doc.documentElement.namespaceURI;
	var nsResolver = namespace ? function(prefix) {
		if (prefix == 'x') return namespace; else return null;
	} : null;
	var host = doc.location.host;
	var articles = new Array();
	if (detectWeb(doc, url) == "multiple") {
		var items = new Object();
		var xpath = '//div[@id="col2"]/p/strong/a';
		var arts = doc.evaluate(xpath, doc, nsResolver, XPathResult.ANY_TYPE, null);
		var next_art;
		while (next_art = arts.iterateNext()) {
			items[next_art.href] = Zotero.Utilities.trimInternal(next_art.textContent);
		}
		items = Zotero.selectItems(items);
		for (var i in items) {
			articles.push(i);
		}
	} else {
		articles = [url];
	}
	Zotero.Utilities.processDocuments(articles, function(newDoc) {
		var osalink = newDoc.evaluate('//div[@id="abstract"]/p/a[contains(text(), "opticsinfobase")]', newDoc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().href;
		Zotero.Utilities.HTTP.doGet(osalink, function(text) {
			var action = text.match(/select\s+name=\"([^"]+)\"/)[1];
			var id = text.match(/input\s+type=\"hidden\"\s+name=\"articles\"\s+value=\"([^"]+)\"/)[1];
			if (newDoc.evaluate('//p[*[contains(text(), "DOI")]]', newDoc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext()) {
				var doi = Zotero.Utilities.trimInternal(newDoc.evaluate('//p[*[contains(text(), "DOI")]]', newDoc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().textContent);
				doi = doi.match(/doi:(.*)$/)[1];
			}
			var get = 'http://' + host + '/custom_tags/IB_Download_Citations.cfm';
			var post = 'articles=' + id + '&ArticleAction=save_endnote2&' + action + '=save_endnote2';
			Zotero.Utilities.HTTP.doPost(get, post, function(text) {
				var translator = Zotero.loadTranslator("import");
				translator.setTranslator("32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7");
				translator.setString(text);
				translator.setHandler("itemDone", function(obj, item) {
					var pubName;
					if (item.journalAbbreviation) {
						pubName = item.journalAbbreviation;
					} else {
						pubName = item.publicationTitle;
					}
					if (doi) item.DOI = doi;
					item.attachments = [{url:osalink, title:pubName + " Snapshot", mimeType:"text/html"}];
					item.complete();
				});
				translator.translate();
			});
		});
	}, function() {Zotero.done;});
}