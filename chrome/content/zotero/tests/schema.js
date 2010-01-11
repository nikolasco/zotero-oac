module("schema");

test("tables exist", 3, function() {
         function tableExists(name) {
             try {
                 Zotero.DB.query("SELECT * FROM " + name + " LIMIT 0");
                 return true;
             } catch (x) {
                 return false;
             }
         }
         ok(tableExists("oacAnnotations"), "oacAnnotations exists");
         ok(tableExists("oacSegments"), "oacAnnotations exists");
         ok(tableExists("oacContexts"), "oacAnnotations exists");
});
