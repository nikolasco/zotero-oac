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
	const Cc = Components.classes;
	const Ci = Components.interfaces;

	function forEachInObj(o, func) {
		for (var p in o) {
			if (o.hasOwnProperty(p)) func(o[p], p);
		}
	}

	Zotero.Annotaters.classForFileName = function (name) {
		var m = /\.([^.]+)$/.exec(name);
		if (!m)  return null;
		var ext = m[1].toLowerCase();
		for (p in Zotero.Annotaters) {
			if (!Zotero.Annotaters.hasOwnProperty(p)) continue;
			var anno = Zotero.Annotaters[p];
			if (anno.annotatesExts && anno.annotatesExts.hasOwnProperty(ext)) {
				return anno;
			}
		}
		return null;
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
		TO_REPLACE.forEach(function(o){ret = ret.replace(o.re, o.with);});
		return ret;
	}

	function buildScriptDeps(deps) {
		var ret = [];
		forEachInObj(deps, function (fl, dir) {
			fl.forEach(function(f) {
				ret.push("<script src=\"chrome://zotero-content/content/" +
					escapeHTML(encodeURIComponent(dir)) + "/" +
					escapeHTML(encodeURIComponent(f)) + "\"></script>");
			});
		});
		return ret.join("\n");
	}

	var ZIVD = Zotero.Annotaters.ImageVectorDrawer = function(contentDoc, oldAnnos) {
		this._contentDoc = contentDoc;

		var img = this._img = contentDoc.getElementsByTagName("img")[0];
		var initScale = img.clientHeight / img.naturalHeight;
		this._mode = 's';
		contentDoc.defaultView.wrappedJSObject.build(this._mode, initScale, oldAnnos);
	};

	ZIVD.annotatesExts = {
		"png": true,
		"jpg": true,
		"jpeg": true,
		"gif": true};
	ZIVD.toolbarID = "zotero-annotate-tb-vector-drawer";
	ZIVD.getHTMLString = function (title, zoteroURI, fileURI) {
		return "<html><head><title>" + escapeHTML(title) + "</title>\n" +
				"<link rel='stylesheet' type='text/css' href='chrome://zotero-content/skin/annotations/wrapper.css' />"+
				"<link rel='stylesheet' type='text/css' href='chrome://zotero-content/skin/annotations/note.css' />"+
				"<link rel=\"stylesheet\" type=\"text/css\" href=\"chrome://zotero-content/skin/annotations/ImageVectorDrawer.css\" />\n" +
			"</head><body>\n" +
			"<div class='zotero'><img src='chrome://zotero-content/skin/annotations/images/zotero_logo.png' class='logo'/></div>"+
			"<img id=\"to-mark\" src=\"" + escapeHTML(zoteroURI) + "\" />\n" +
			buildScriptDeps({
				"libs": ["jquery.js", "raphael.js", "underscore.js"],
				"annotations": ["VectorDrawer.js", "ImageVectorDrawer.js"]
			}) +
			"\n</body></html>";
	};

	ZIVD.prototype = {
		shouldSave: function() {
			return JSON.parse(this._contentDoc.defaultView.wrappedJSObject.savable());
		},
		resized: function() {
			var scale = this._img.clientHeight / this._img.naturalHeight;
			this._contentDoc.defaultView.wrappedJSObject.scale(scale);
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
			forEachInObj(toolCallbacks, function(mode, elID){
				var el = browserDoc.getElementById(elID);
				self._curCallbacks[elID] = function() {
					self._contentDoc.defaultView.wrappedJSObject.mode(mode);
					self._mode = mode;
				};
				el.addEventListener("command", self._curCallbacks[elID], false);
				if (mode == self._mode) el.checked = true;
			});

			// TODO: add scaling UI
		},
		teardownCallbacks: function(browserDoc) {
			var self = this;
			forEachInObj(self._curCallbacks, function(cb, elID){
				browserDoc.getElementById(elID).removeEventListener("command", cb, false);
			});
			self._curCallbacks = {};

			// TODO: add scaling UI
		},
		klass: ZIVD,
		constructor: ZIVD
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
		var flashURI = cr.convertChromeURL(ios.newURI("chrome://zotero-content/content/annotations/AudioPlayer.swf", null, null));

		return "<html><head><title>" + escapeHTML(title) + "</title>"+
		"<link rel='stylesheet' type='text/css' href='chrome://zotero-content/skin/annotations/wrapper.css' />"+
"<link rel='stylesheet' type='text/css' href='chrome://zotero-content/skin/annotations/AudioTimeMarker.css' />"+
	"<link type='text/css' href='chrome://zotero-content/skin/libs/ui.all-slider.css' rel='stylesheet' /> "+
		"</head><body>\n" +
			"<div class='zotero'><img src='chrome://zotero-content/skin/annotations/images/zotero_logo.png' class='logo'/></div>"+
			"<div class='audio-container'>"+
			"<div id='player-ui-container'></div>"+
			"<div id='time-marker-container'></div>"+
					"<embed src=\"" + escapeHTML(flashURI.spec) + "\"\n" +
				"FlashVars=\"" + escapeHTML("eid=1&soundURL=" + fileURI) + "\" \n" +
				"allowscriptaccess=\"always\"\n"  +
				"id=\"player\" style=\"height: 0; width: 0;\"></embed>\n" +
				"</div>"+
				buildScriptDeps({
					"libs": ["jquery.js", "underscore.js", "jquery.ui.core.js",
						"jquery.ui.widget.js", "jquery.ui.mouse.js",
						"jquery.ui.slider.js"],
					"annotations": ["PlayerUI.js","TimeMarker.js",
						"AudioTimeMarker.js", "other.js"]
				}) + "\n</body></html>";
	};

	ZATM.prototype = {
		shouldSave: function() {
			//return JSON.parse(this._contentDoc.defaultView.wrappedJSObject.savable());
			var ret = JSON.parse(this._contentDoc.defaultView.wrappedJSObject.savable());
			return ret;
		},
		setupCallbacks: function(browserDoc) {
			var self = this;
			const toolCallbacks = {
				"zotero-annotate-tb-audio-time-marker-mark": "markNow",
				"zotero-annotate-tb-audio-time-marker-range": "markStartEnd"
			};
			self._curCallbacks = {};
			forEachInObj(toolCallbacks, function(funcName, elID){
				var cb = self._curCallbacks[elID] = function () {
					self._contentDoc.defaultView.wrappedJSObject[funcName]();
				};
				browserDoc.getElementById(elID).addEventListener("command", cb, false);
			});
		},
		teardownCallbacks: function(browserDoc) {
			forEachInObj(this._curCallbacks, function(cb, elID){
				browserDoc.getElementById(elID).removeEventListener("command", cb, false);
			});
			this._curCallbacks = {};
		},
		klass: ZATM,
		constructor: ZATM
	};

	var ZVDM = Zotero.Annotaters.VideoDrawerMarker = function(contentDoc, oldAnnos) {
		this._contentDoc = contentDoc;
		this._curCallbacks = {};

		contentDoc.defaultView.wrappedJSObject.build(oldAnnos);
	};

	ZVDM.annotatesExts = {
		"flv": true,
		"mp4": true,
		"m4v": true};
	ZVDM.toolbarID = "zotero-annotate-tb-video-drawer-marker";
	ZVDM.getHTMLString = function (title, zoteroURI, fileURI) {
		var ios = Cc["@mozilla.org/network/io-service;1"]
			.getService(Ci.nsIIOService);
		var cr = Cc["@mozilla.org/chrome/chrome-registry;1"].
			getService(Ci.nsIChromeRegistry);
		var flashURI = cr.convertChromeURL(ios.newURI("chrome://zotero-content/content/annotations/VideoPlayerMarker.swf", null, null));

		return "<html><head><title>" + escapeHTML(title) + "</title></head><body>\n" +
			"<embed src=\"" + escapeHTML(flashURI.spec) + "\"\n" +
				"FlashVars=\"" + escapeHTML("eid=1&videoURL=" + fileURI) + "\" \n" +
				"allowscriptaccess=\"always\"\n"  +
				"id=\"player\" style=\"height: 300; width: 400;\"></embed>\n" +
			"<div id=\"player-ui-container\"></div>\n" +
			"<div id=\"time-marker-container\"></div>\n" +
			buildScriptDeps({
				"libs": ["jquery.js", "underscore.js"],
				"annotations": ["PlayerUI.js","TimeMarker.js", "VideoDrawerMarker.js"]
			}) + "\n</body></html>";
	};

	ZVDM.prototype = {
		shouldSave: function() {
			return JSON.parse(this._contentDoc.defaultView.wrappedJSObject.savable());
		},
		setupCallbacks: function(browserDoc) {
			var self = this;
			const drawToolCallbacks = {
				'zotero-annotate-tb-vector-drawer-rectangle': 'r',
				'zotero-annotate-tb-vector-drawer-ellipse': 'e',
				'zotero-annotate-tb-vector-drawer-polygon': 'p',
				'zotero-annotate-tb-vector-drawer-select': 's'
			};
			const markToolCallbacks = {
				"zotero-annotate-tb-audio-time-marker-mark": "markNow",
				"zotero-annotate-tb-audio-time-marker-range": "markStartEnd"
			};
			self._curCallbacks = {};
			forEachInObj(drawToolCallbacks, function(mode, elID){
				var el = browserDoc.getElementById(elID);
				var cb = self._curCallbacks[elID] = function() {
					self._contentDoc.defaultView.wrappedJSObject.mode(mode);
					self._mode = mode;
				};
				el.addEventListener("command", cb, false);
				if (mode == self._mode) el.checked = true;
			});
			forEachInObj(markToolCallbacks, function(funcName, elID){
				var cb = self._curCallbacks[elID] = function () {
					self._contentDoc.defaultView.wrappedJSObject[funcName]();
				};
				browserDoc.getElementById(elID).addEventListener("command", cb, false);
			});
		},
		teardownCallbacks: function(browserDoc) {
			forEachInObj(this._curCallbacks, function(cb, elID){
				browserDoc.getElementById(elID).removeEventListener("command", cb, false);
			});
			this._curCallbacks = {};
		},
		klass: ZVDM,
		constructor: ZVDM
	};
})();
