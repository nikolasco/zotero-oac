(function() {
     var libFiles = [
         'underscore'
     ];

     Zotero.Libs = {exports: {}};

     for (var i=0; i<libFiles.length; i++) {
         try {
	     Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
	         .getService(Ci.mozIJSSubScriptLoader)
	         .loadSubScript("chrome://zotero/content/xpcom/libs/" + libFiles[i] + ".js", Zotero.Libs);
         }
         catch (e) {
	     Components.utils.reportError("Error loading " + libFiles[i] + ".js: " + e);
	     throw (e);
         }
     }
     

     var _ = Zotero.Libs.exports._;
     _.each(Zotero.Libs.exports, function(libVal, libName) {
         Zotero.Libs[libName] = libVal;
     });
})();