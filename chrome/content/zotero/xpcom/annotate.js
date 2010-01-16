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
	getAnnotationIDFromURL: function(url) {
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

     function getContents(aURL){
         var ios = Components.classes["@mozilla.org/network/io-service;1"]
             .getService(Components.interfaces.nsIIOService);
         var ss = Components
             .classes["@mozilla.org/scriptableinputstream;1"]
             .getService(Components.interfaces.nsIScriptableInputStream);

         var chan = ios.newChannel(aURL,null,null);
         var inp = chan.open();
         ss.init(inp);
         var str = ss.read(inp.available());
         ss.close();
         inp.close();
         return str;
     }

     var ZVD = Zotero.Annotaters.VectorDrawer = function(contentDoc, oldAnnos) {
         const VECTOR_DRAWER_DEPS = [
             "libs/jquery.js",
             "libs/raphael.js",
             "xpcom/libs/underscore.js",
             "libs/VectorDrawer.js"];
         this._contentDoc = contentDoc;
         _.each(VECTOR_DRAWER_DEPS, function (dep) {
                    // TODO: make a content accessible chrom package so we can just use src=
                    var s = contentDoc.createElement("script");
                    var ss = contentDoc.createTextNode(getContents("chrome://zotero/content/" + dep));
                    s.appendChild(ss);
                    contentDoc.body.appendChild(s);
         });

         var img = this._img = contentDoc.getElementsByTagName("img")[0];
         var initScale = img.clientHeight / img.naturalHeight;
         // XXX: TODO: pass in old objs to draw
         this._mode = 'r';
         contentDoc.defaultView.location = "javascript:window.drawer = new VectorDrawer('" + this._mode + "', " + initScale + ", document.getElementsByTagName('img')[0]); undefined";
     };

     ZVD.annotatesTypes = {
         "image/png": true,
         "image/jpeg": true,
         "image/gif": true};
     ZVD.toolbarID = "zotero-annotate-tb-vector-drawer";

     const toolCallbacks = {
         'zotero-annotate-tb-vector-drawer-rectangle': 'r',
         'zotero-annotate-tb-vector-drawer-ellipse': 'e',
         'zotero-annotate-tb-vector-drawer-polygon': 'p'
     };

     ZVD.prototype = {
         shouldSave: function() {
             // XXX: TODO: return objs to save
         },
         resized: function() {
             var scale = this._img.clientHeight / this._img.naturalHeight;
             this._contentDoc.defaultView.location = "javascript:window.drawer.scale(" + scale + "); undefined";
         },
         klass: ZVD,
         setupCallbacks: function(browserDoc) {
             var self = this;
             this._curCallbacks = {};
             _.each(toolCallbacks, function(mode, elID){
                 var el = browserDoc.getElementById(elID);
                 self._curCallbacks[elID] = function() {
                     self._contentDoc.defaultView.location = "javascript:window.drawer.drawMode('"+ mode + "'); undefined";
                     self._mode = mode;
                     el.checked = true;
                     if (self._prevChecked) self._prevChecked.checked = false;
                     self._prevChecked = el;
                 };
                 el.addEventListener("command", self._curCallbacks[elID], false);
                 if (mode == self._mode) {
                     el.checked = true;
                     self._prevChecked = el;
                 }
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
         }
     };
     ZVD.constructor = ZVD;
})();