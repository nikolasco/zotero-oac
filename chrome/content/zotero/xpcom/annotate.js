/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    
    You should have received a copy of the GNU General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.Annotate = {
	/**
	 * Gets the annotation ID from a given URL
	 */
	getAttachmentIDFromURL: function(url) {
		const attachmentRe = /^zotero:\/\/attachment\/([0-9]+)\/$/;
		var m = attachmentRe.exec(url);
		return m ? m[1] : false;
	},
    isAnnotated: function(id) {
	const XUL_NAMESPACE = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

	var annotationURL = "zotero://attachment/"+id+"/";
	var haveBrowser = false;

	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
	    .getService(Components.interfaces.nsIWindowMediator);
	var enumerator = wm.getEnumerator("navigator:browser");
	while(enumerator.hasMoreElements()) {
	    var win = enumerator.getNext();
	    var tabbrowser = win.document.getElementsByTagNameNS(XUL_NAMESPACE, "tabbrowser");
	    if(tabbrowser && tabbrowser.length) {
		var browsers = tabbrowser[0].browsers;
	    } else {
		var browsers = win.document.getElementsByTagNameNS(XUL_NAMESPACE, "browser");
	    }
	    for each(var browser in browsers) {
		if(browser.currentURI) {
		    if(browser.currentURI.spec == annotationURL) {
			if(haveBrowser) {
			    // require two with this URI
			    return true;
			} else {
			    haveBrowser = true;
			}
		    }
		}
	    }
	}

	return false;
    }
};

// just set this up for later files
Zotero.Annotaters = {};

(function() {
     const _ = Zotero.Libs._;
     const Cc = Components.classes;
     const Ci = Components.interfaces;

     function getContents(aURL){
         var ios = Cc["@mozilla.org/network/io-service;1"]
             .getService(Ci.nsIIOService);
         var ss = Cc["@mozilla.org/scriptableinputstream;1"]
             .getService(Ci.nsIScriptableInputStream);

         var chan = ios.newChannel(aURL,null,null);
         var inp = chan.open();
         ss.init(inp);
         var str = ss.read(inp.available());
         ss.close();
         inp.close();
         return str;
     }

     Zotero.Annotaters.classForFileName = function (name) {	 
         var m = /\.([^.]+)$/.exec(name);
         if (!m)  return null;
         var ext = m[1].toLowerCase();
         var classes =  _.select(Zotero.Annotaters, function(ano) {
             return ano && ano.annotatesExts && ano.annotatesExts.hasOwnProperty(ext);
         });

         return classes.length? classes[0] : null;
     };

     function escapeHTML(html) {
         const TO_REPLACE = [
             {re: /&/g, with: "&amp;"}, // must be first
             {re: /"/g, with: "&quot;"},
             {re: /'/g, with: "&apos;"},
             {re: /</g, with: "&lt;"},
             {re: />/g, with: "&gt;"}
         ];
         var ret = html;
         _.each(TO_REPLACE, function(o){ret = ret.replace(o.re, o.with);});
         return ret;
     }

     function buildScriptDeps(deps) {
         return _.map(deps, function (d) {
             return "<script src=\"chrome://zotero-content/content/" +
                 escapeHTML(encodeURIComponent(d)) + "\"></script>";
         }).join("\n");
     }

     var ZVD = Zotero.Annotaters.VectorDrawer = function(contentDoc, oldAnnos) {
         this._contentDoc = contentDoc;

         var img = this._img = contentDoc.getElementsByTagName("img")[0];
         var initScale = img.clientHeight / img.naturalHeight;
         this._mode = 's';
         // calling across the security boundry fails miserably :(
         contentDoc.defaultView.location = "javascript:window.drawer = new VectorDrawer('" + this._mode + "', " + initScale + ", " + encodeURI(JSON.stringify(oldAnnos)) + ", document.getElementsByTagName('img')[0]); undefined";
         contentDoc.defaultView.location = "javascript:function savable() {return JSON.stringify(drawer.savable());}; undefined";
     };

     ZVD.annotatesExts = {
         "png": true,
         "jpg": true,
         "jpeg": true,
         "gif": true};
     ZVD.toolbarID = "zotero-annotate-tb-vector-drawer";
     ZVD.getHTMLString = function (title, zoteroURI, fileURI) {
         return "<html><head><title>" + escapeHTML(title) + "</title></head><body>\n" +
             "<img src=\"" + escapeHTML(zoteroURI) + "\" />\n" + 
             buildScriptDeps(["jquery.js", "raphael.js", "underscore.js","VectorDrawer.js"]) +
             "\n</body></html>";
     };

     ZVD.prototype = {
         shouldSave: function() {
             // the stringify+parse round-trip is needed to avoid mangling :/
             // note that savable() called here is defined by our constructor above
             return JSON.parse(this._contentDoc.defaultView.wrappedJSObject.savable());
         },
         resized: function() {
             var scale = this._img.clientHeight / this._img.naturalHeight;
             this._contentDoc.defaultView.location = "javascript:window.drawer.scale(" + scale + "); undefined";
         },
         setupCallbacks: function(browserDoc) {
             const toolCallbacks = {
                 'zotero-annotate-tb-vector-drawer-rectangle': 'r',
                 'zotero-annotate-tb-vector-drawer-ellipse': 'e',
                 'zotero-annotate-tb-vector-drawer-polygon': 'p',
                 'zotero-annotate-tb-vector-drawer-select': 's'
             };
             var self = this;
             this._curCallbacks = {};
             _.each(toolCallbacks, function(mode, elID){
                 var el = browserDoc.getElementById(elID);
                 self._curCallbacks[elID] = function() {
                     self._contentDoc.defaultView.location = "javascript:window.drawer.drawMode('"+ mode + "'); undefined";
                     self._mode = mode;
                 };
                 el.addEventListener("command", self._curCallbacks[elID], false);
                 if (mode == self._mode) el.checked = true;
             });

             // TODO: add scaling UI
         },
         teardownCallbacks: function(browserDoc) {
             var self = this;
             _.each(self._curCallbacks, function(cb, elID){
                 browserDoc.getElementById(elID).removeEventListener("command", cb, false);
             });
             self._curCallbacks = {};

             // TODO: add scaling UI
         },
         klass: ZVD,
         constructor: ZVD
     };

     var ZATM = Zotero.Annotaters.AudioTimeMarker = function(contentDoc, oldAnnos) {
         this._contentDoc = contentDoc;
         this._curCallbacks = {};

         contentDoc.defaultView.wrappedJSObject.build(oldAnnos);
     };

     ZATM.annotatesExts = {
         "mp3": true,
         "aac": true};
     ZATM.toolbarID = "zotero-annotate-tb-audio-time-marker";
     ZATM.getHTMLString = function (title, zoteroURI, fileURI) {
         var ios = Cc["@mozilla.org/network/io-service;1"]
             .getService(Ci.nsIIOService);
         var cr = Cc["@mozilla.org/chrome/chrome-registry;1"].
             getService(Ci.nsIChromeRegistry);
         var flashURI = cr.convertChromeURL(ios.newURI("chrome://zotero-content/content/AudioPlayer.swf", null, null));

         return "<html><head><title>" + escapeHTML(title) + "</title></head><body>\n" + 
             "<div id=\"player-ui-container\"></div>\n" +
             "<div id=\"time-marker-container\"></div>\n" +
             "<embed src=\"" + escapeHTML(flashURI.spec) + "\"\n" +
                 "FlashVars=\"" + escapeHTML("eid=1&soundURL=" + fileURI) + "\" \n" + 
                 "allowscriptaccess=\"always\"\n"  + 
                 "id=\"player\" style=\"height: 0; width: 0;\"></embed>\n" +
             buildScriptDeps(["jquery.js", "underscore.js", "PlayerUI.js","TimeMarker.js", "AudioTimeMarker.js"]) + "\n</body></html>";
     };

     ZATM.prototype = {
         shouldSave: function() {
             // the stringify+parse round-trip is needed to avoid mangling :/
             return JSON.parse(this._contentDoc.defaultView.wrappedJSObject.savable());
         },
         setupCallbacks: function(browserDoc) {
             var self = this;
             const toolCallbacks = {
                 "zotero-annotate-tb-audio-time-marker-mark": "markNow",
                 "zotero-annotate-tb-audio-time-marker-range": "markStartEnd"
             };
             self._curCallbacks = {};
             _.each(toolCallbacks, function(funcName, elID){
                 var cb = self._curCallbacks[elID] = function () {
                     self._contentDoc.defaultView.wrappedJSObject[funcName]();
                 };
                 browserDoc.getElementById(elID).addEventListener("command", cb, false);
             });
         },
         teardownCallbacks: function(browserDoc) {
             _.each(this._curCallbacks, function(cb, elID){
                 browserDoc.getElementById(elID).removeEventListener("command", cb, false);
             });
             this._curCallbacks = {};
         },
         klass: ZATM,
         constructor: ZATM
     };
})();