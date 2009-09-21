{
	"translatorID":"636c8ea6-2af7-4488-8ccd-ea280e4a7a98",
	"translatorType":4,
	"label":"Sage Journals Online",
	"creator":"Michael Berkowitz",
	"target":"http://[^/]*\\.sagepub\\.com[^/]*/",
	"minVersion":"1.0.0b4.r5",
	"maxVersion":"",
	"priority":100,
	"inRepository":true,
	"lastUpdated":"2009-01-28 18:10:00"
}

function detectWeb(doc, url) {
	if (url.indexOf("searchresults") != -1 || (doc.title.indexOf("Table of Contents") != -1)) {
		return "multiple";
	} else if (url.indexOf("cgi/content") != -1) {
		return "journalArticle";
	}
}

function doWeb(doc, url) {
	var arts = new Array();
	if (detectWeb(doc, url) == "multiple") {
		var items = new Object();
		if (doc.title.indexOf("Table of Contents") != -1) {
			var searchx = '//div[@id="maincontent"]/div[@class="contentarea"]/table[@class="toc"]/tbody/tr/td[2][@class="rightcol"]/form/dl/dd'; 
			var titlex = './/strong';
		} else {
			var searchx = '//form[@id="search_results"]/div[@class="resultsitem"]/div[2]';
			var titlex = './/label';
			
		}	
		var linkx = './/a[contains(@href, "abstract")]';
		var searchres = doc.evaluate(searchx, doc, null, XPathResult.ANY_TYPE, null);
		var next_res;
		while (next_res = searchres.iterateNext()) {
			var title = doc.evaluate(titlex, next_res, null, XPathResult.ANY_TYPE, null).iterateNext().textContent;
			// sometimes there is no abstract, the search results returns an entire journal, I am skipping it silently
			var link = doc.evaluate(linkx, next_res, null, XPathResult.ANY_TYPE, null).iterateNext();
			if (link) {
				items[link.href] = title;
			}
		}
		items = Zotero.selectItems(items);
		for (var i in items) {
			arts.push(i);
		} 
	} else {
		arts = [url];
	}
	var newurls = new Array();
	for each (var i in arts) {
		newurls.push(i);
	}
	Zotero.Utilities.HTTP.doGet(arts, function(text) {
		var id = text.match(/=([^=]+)\">\s*Add to Saved Citations/)[1];
		var newurl = newurls.shift();
		var pdfurl = newurl.replace(/content\/[^/]+/, "reprint") + ".pdf";
		if (pdfurl.indexOf("?") != -1) {
			pdfurl = pdfurl.substring(0,pdfurl.indexOf("?")) + ".pdf";
		}
		Zotero.debug("pdf= "+pdfurl);
		var get = 'http://online.sagepub.com/cgi/citmgr?type=refman&gca=' + id;
		Zotero.Utilities.HTTP.doGet(get, function(text) {
			var translator = Zotero.loadTranslator("import");
			translator.setTranslator("32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7");
			translator.setString(text);
			if (text.match(/N1(.*)\n/)) {
				var doi = text.match(/N1\s+\-\s+(.*)\n/)[1];
			}
			translator.setHandler("itemDone", function(obj, item) {
				item.attachments = [
					{url:newurl, title:"Sage Journals Snapshot", mimeType:"text/html"},
					{url:pdfurl, title:"Sage Journals Full Text PDF", mimeType:"application/pdf"}
				];
				if (doi) item.DOI = doi;
				if (item.notes) item.notes = [];
				item.complete();
			});
			translator.translate();
		});
	});
	Zotero.wait();
}