{
	"translatorID":"d0b1914a-11f1-4dd7-8557-b32fe8a3dd47",
	"translatorType":4,
	"label":"EBSCOhost",
	"creator":"Simon Kornblith and Michael Berkowitz",
	"target":"https?://[^/]+/(?:bsi|ehost)/(?:results|detail|folder)",
	"minVersion":"1.0.0b3.r1",
	"maxVersion":"",
	"priority":100,
	"inRepository":true,
	"lastUpdated":"2009-06-04 00:00:00"
}

function detectWeb(doc, url) {
	var namespace = doc.documentElement.namespaceURI;
	var nsResolver = namespace ? function(prefix) {
		if (prefix == 'x') return namespace; else return null;
	} : null;
	
	// See if this is a search results or folder results page
	var searchResult = doc.evaluate('//ul[@class="result-list" or @class="folder-list"]/li/div[@class="result-list-record" or @class="folder-item"]', doc, nsResolver,
	                                XPathResult.ANY_TYPE, null).iterateNext();         
	if(searchResult) {
		return "multiple";
	}
/*
	var xpath = '//div[@class="citation-wrapping-div"]/dl[@class="citation-fields"]/dt[starts-with(text(), "Persistent link to this record")'
		+' or starts-with(text(), "Vínculo persistente a este informe")'
		+' or starts-with(text(), "Lien permanent à cette donnée")'
		+' or starts-with(text(), "Permanenter Link zu diesem Datensatz")'
		+' or starts-with(text(), "Link permanente al record")'
		+' or starts-with(text(), "Link permanente para este registro")'
		+' or starts-with(text(), "本記錄固定連結")'
		+' or starts-with(text(), "此记录的永久链接")'
		+' or starts-with(text(), "このレコードへのパーシスタント リンク")'
		+' or starts-with(text(), "레코드 링크 URL")'
		+' or starts-with(text(), "Постоянная ссылка на эту запись")'
		+' or starts-with(text(), "Bu kayda sürekli bağlantı")'
		+' or starts-with(text(), "Μόνιμος σύνδεσμος σε αυτό το αρχείο")]';
*/
	var xpath = '//input[@id="ctl00_ctl00_MainContentArea_MainContentArea_topDeliveryControl_deliveryButtonControl_lnkExportImage"]';	
	var persistentLink = doc.evaluate(xpath, doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext();
	if(persistentLink) {
		return "journalArticle";
	}
}

var customViewStateMatch = /<input type="hidden" name="__CUSTOMVIEWSTATE" id="__CUSTOMVIEWSTATE" value="([^"]+)" \/>/
var host;

function fullEscape(text) {
	return escape(text).replace(/\//g, "%2F").replace(/\+/g, "%2B");
}

function generateDeliverString(nsResolver, doc){	
	var hiddenInputs = doc.evaluate('//input[@type="hidden" and not(contains(@name, "folderHas")) and not(@name ="ajax")]', doc, nsResolver, XPathResult.ANY_TYPE, null);
	var hiddenInput;
	var deliverString ="";
	while(hiddenInput = hiddenInputs.iterateNext()) {
		deliverString = deliverString+hiddenInput.name.replace(/\$/g, "%24")+"="+encodeURIComponent(hiddenInput.value) + "&";
	}
	var otherHiddenInputs = doc.evaluate('//input[@type="hidden" and contains(@name, "folderHas")]', doc, nsResolver, XPathResult.ANY_TYPE, null);
	while(hiddenInput = otherHiddenInputs.iterateNext()) {
		deliverString = deliverString+hiddenInput.name.replace(/\$/g, "%24")+"="+escape(hiddenInput.value).replace(/\//g, "%2F").replace(/%20/g, "+") + "&";
	}


	deliverString = deliverString
		+"&ctl00%24ctl00%24MainContentArea%24MainContentArea%24topDeliveryControl%24deliveryButtonControl%24lnkExportImage.x=5"
		+"&ctl00%24ctl00%24MainContentArea%24MainContentArea%24topDeliveryControl%24deliveryButtonControl%24lnkExportImage.y=14";
			
	return deliverString;
}


/*
 * given the text of the delivery page, downloads an item
 */
function downloadFunction(text) {
	
	//Zotero.debug("POSTTEXT="+text);
	var postLocation = /<form (?:autocomplete="o(?:ff|n)" )?name="aspnetForm" method="post" action="([^"]+)"/
	var postMatch = postLocation.exec(text);
	var deliveryURL = postMatch[1].replace(/&amp;/g, "&");
	postMatch = customViewStateMatch.exec(text);
	var downloadString = "__EVENTTARGET=&__EVENTARGUMENT=&__CUSTOMVIEWSTATE="+fullEscape(postMatch[1])+"&__VIEWSTATE=&ctl00%24ctl00%24MainContentArea%24MainContentArea%24ctl00%24btnSubmit=Save&ctl00%24ctl00%24MainContentArea%24MainContentArea%24ctl00%24BibFormat=1&ajax=enabled";
	
	Zotero.Utilities.HTTP.doPost(host+"/ehost/"+deliveryURL,
								 downloadString, function(text) {	// get marked records as RIS
		// load translator for RIS
		var test = text.match(/UR\s+\-(.*)/g);
		if (text.match(/AB\s\s\-/)) text = text.replace(/AB\s\s\-/, "N2  -");
		if (!text.match(/TY\s\s-/)) text = text+"\nTY  - JOUR\n"; 
		// load translator for RIS
		var translator = Zotero.loadTranslator("import");
		translator.setTranslator("32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7");
		translator.setString(text);
		translator.setHandler("itemDone", function(obj, item) {
			if (text.match("L3")) {
				item.DOI = text.match(/L3\s+\-\s*(.*)/)[1];
			}
			if (text.match("T1")) {
				item.title = text.match(/T1\s+-\s*(.*)/)[1];
			}
			item.itemType = "journalArticle";
			// RIS translator tries to download the link in "UR" this leads to unhappyness
			item.attachments = [];
			item.complete();

		});
		translator.translate();
		
		Zotero.done();
	});
}

function doWeb(doc, url) {
	var namespace = doc.documentElement.namespaceURI;
	var nsResolver = namespace ? function(prefix) {
		if (prefix == 'x') return namespace; else return null;
	} : null;

	var hostRe = new RegExp("^(https?://[^/]+)/");
	var hostMatch = hostRe.exec(url);
	host = hostMatch[1];
	                                
	var searchResult = doc.evaluate('//ul[@class="result-list" or @class="folder-list"]/li/div[@class="result-list-record" or @class="folder-item"]', doc, nsResolver,
	                                XPathResult.ANY_TYPE, null).iterateNext();                              

	if(searchResult) {
		var titlex = '//div[@class="result-list-record" or @class="folder-item-detail" or @class="image-result"]/span/a[@class = "title-link"]';
		var titles = doc.evaluate(titlex, doc, nsResolver, XPathResult.ANY_TYPE, null);
		var items = new Object();
		var title;
		while (title = titles.iterateNext()) {
			items[title.href] = title.textContent;
		}
		
		var items = Zotero.selectItems(items);
		if(!items) {
			return true;
		}

		var uris = new Array();
		for(var i in items) {
			uris.push(i);
		}
		
		Zotero.Utilities.processDocuments(uris, function(newDoc){
			var postURL = newDoc.evaluate('//form[@name="aspnetForm"]/@action', newDoc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext();
			postURL = host+"/ehost/"+postURL.nodeValue;
			var deliverString = generateDeliverString(nsResolver, newDoc);
			Zotero.Utilities.HTTP.doPost(postURL, deliverString, downloadFunction);
		});
	} else {
		//This is a hack, generateDeliveryString is acting up for single pages, but it works on the plink url
		var link = [doc.evaluate("//input[@id ='pLink']/@value", doc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext().nodeValue];
		Zotero.Utilities.processDocuments(link, function(newDoc){			
			var postURL = newDoc.evaluate('//form[@name="aspnetForm"]/@action', newDoc, nsResolver, XPathResult.ANY_TYPE, null).iterateNext();
			postURL = host+"/ehost/"+postURL.nodeValue;
			var deliverString = generateDeliverString(nsResolver, newDoc);
			Zotero.Utilities.HTTP.doPost(postURL, deliverString, downloadFunction);
		});

	}
	Zotero.wait();
}