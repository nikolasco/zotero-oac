(function ($, R, _) {
     var rootNS = this;
     var TOO_SMALL = 2;
     var CLOSE_ENOUGH = 8;
     var INIT_ATTRS = {"stroke-width": "1px", "stroke": "black"};
     var SELECTED_ATTRS = {"stroke-width": "1px", "stroke": "#ff6666"};

     function makePathStr(ps) {
         return "M " + _.map(ps, function(p) {return p.x + " " + p.y;}).join(" L ");
     }

     function lineSegsIntersect(a1, a2, b1, b2) {
         var bXdiff = b1.x-b2.x, bYdiff = b1.y-b2.y;
         var aXdiff = a1.x-a2.x, aYdiff = a1.y-a2.y;
         var aDet = a1.x*a2.y - a1.y*a2.x, bDet = b1.x*b2.y - b1.y*b2.x,
             denom = aXdiff*bYdiff - aYdiff*bXdiff;
         var interX = (aDet*bXdiff - aXdiff*bDet)/denom,
             interY = (aDet*bYdiff - aYdiff*bDet)/denom;

         // check if it's within the segment
         return interX > _.min([a1.x,a2.x]) && interX < _.max([a1.x,a2.x]) &&
             interY > _.min([a1.y,a2.y]) && interY < _.max([a1.y,a2.y]) &&
             interX > _.min([b1.x,b2.x]) && interX < _.max([b1.x,b2.x]) &&
             interY > _.min([b1.y,b2.y]) && interY < _.max([b1.y,b2.y]);
     }

     function eachPoint(path, func) {
         // copy without the beginning "M " or ending " z", then split on " L "
         var parts = path.substr(2, path.length-4).split(" L ");
         var np = makePathStr(_.map(parts, function(p){
             var xy = p.split(" ");
             return func({x: xy[0]*1, y: xy[1]*1});
         }));
         return np + " z";
         
     }

     function shiftArgs(con, args, shift) {
         shift = {x: shift.x, y: shift.y};
         if (con == "rect" || con == "ellipse") {
             return [args[0]+shift.x, args[1]+shift.y, args[2], args[3]];
         } else if (con == "path") {
             return [eachPoint(args[0], function(p){
                 return {x: p.x+shift.x, y: p.y+shift.y};
             })];
         } else {
             throw "should not be reached";
         }
     }

     function relScale(vd, o) {
         return vd._scale/o.scale;
     }

     // initDrawMode should be one of the modes
     // overElm is the element that this VectorDrawer will be laid on top of
     // Note: the VectorDrawer will not move or resize if the element does
     rootNS.VectorDrawer = function (initDrawMode, initScale, initObjs, overElm) {
         var self = this;
         // only thing that methods access at the moment
         self._drawMode = initDrawMode || 'r';
         self._scale = initScale || 1;
         self._allObjs = initObjs || [];
         self._start = self._obj = self._points = null;

         // XXX: should handle wandering out of the area...
         overElm = $(overElm || "img");
         self._over = {
             elm: $(overElm),
             offset: overElm.offset(),
             origWidth: overElm.width()/initScale,
             origHeight: overElm.height()/initScale};
         self._buildCanvas();
     };
     rootNS.VectorDrawer.prototype = {};
     jQuery.extend(rootNS.VectorDrawer.prototype, {
         drawMode: function(newMode) {
             if (newMode != null) {
                 if (self._obj) self._obj.cur.attr(INIT_ATTRS);
                 this._drawMode = newMode;
             }
             return this._drawMode;
         },
         scale: function(newScale) {
             var self = this;
             if (newScale == null || newScale < 0) {
                 return self._scale;
             }
             self._scale = newScale;
             var newSize = {
                 width: self._over.origWidth*self._scale,
                 height: self._over.origHeight*self._scale
             };
             self._over.elm.css(newSize);
             _.each(self._allObjs, function (o) {
                 o.cur.remove();
                 o.cur = null;
             });
             self._canvas.elm.remove();
             this._buildCanvas();
             return self._scale;
         },
         savable: function() {
             return _.map(this._allObjs, function(o){
                 return {scale: o.scale, con: o.con, args: o.args};
             });
         },
         _buildCanvas: function() {
             var self = this;
             self._paper = R(self._over.offset.left, self._over.offset.top,
                 self._over.elm.width(), self._over.elm.height());
             self._canvas = {elm:$(self._paper.canvas)};
             self._canvas.off = self._canvas.elm.offset();
             self._over.offset = self._over.elm.offset();
             self._installHandlers();
             _.each(self._allObjs, function (o) {
                 o.cur = self._paper[o.con].apply(self._paper, o.args);
                 var rs = relScale(self, o);
                 o.cur.scale(rs, rs, 0, 0);
             });
         },
         // given an event e, figure out where it is relative to the canvas
         _getCanvasXY: function (e) {
             var self = this;
             return {
                 x: e.clientX-self._canvas.off.left,
                 y: e.clientY-self._canvas.off.top
             };
         },
         _installHandlers: function() {
             var self = this;

             self._canvas.elm.mousedown(function(e) {
                 if (1 != e.which) return;
                 e.preventDefault();

                 var cur = self._getCanvasXY(e);
                 if (self._drawMode == 'r') {
                     self._start = cur;
                     self._obj = self._paper.rect(self._start.x, self._start.y, 0, 0);
                     self._obj.attr(INIT_ATTRS);
                 } else if (self._drawMode == 'e') {
                     self._start = cur;
                     self._obj = self._paper.ellipse(self._start.x, self._start.y, 0, 0);
                     self._obj.attr(INIT_ATTRS);
                 } else if (self._drawMode == 'p') {
                     if (self._points) {
                         var f = _.first(self._points);
                         var a = cur.x - f.x,
                             b = cur.y - f.y;
                         var maybeClosing = false;
                         if (Math.sqrt(a*a + b*b) < CLOSE_ENOUGH) {
                             maybeClosing = true;
                         }
                         if (self._points.length > 2) {
                             // if we're closing the polygon,
                             // then we skip the first line
                             var inter = false,
                                 ps = self._points.slice(maybeClosing? 2:1, -2),
                                 lp = self._points[maybeClosing? 1 : 0],
                                 pcur = self._points[self._points.length-2];
                             _.each(ps, function(cp) {
                                 if (lineSegsIntersect(lp, cp, pcur, cur)) {
                                     inter = true;
                                     _.breakLoop();
                                 }
                                 lp = cp;
                             });
                             // intersection detected, don't use this
                             if (inter) return;
                         }
                         if (maybeClosing) {
                             self._points.pop();
                             var path = makePathStr(self._points) + " z";
                             self._obj.attr({"path": path});
                             var bbox = self._obj.getBBox();
                             if (bbox.width > TOO_SMALL && bbox.height > TOO_SMALL) {
                         
                                 self._allObjs.push({
                                     cur: self._obj,
                                     con: "path",
                                     args: [path],
                                     scale: self._scale
                                 });
                             }
                             self._obj = self._points = null;
                             return; // done!
                         }
                     } else {
                         self._points = [cur];
                         self._obj = self._paper.path(makePathStr(self._points));
                         self._obj.attr(INIT_ATTRS);
                     }
                     self._points.push({x: cur.x, y: cur.y});
                 } else if (self._drawMode == 's') {
                     if (self._obj) self._obj.cur.attr(INIT_ATTRS);
                     self._obj = null;
                     var targetObj = _.first(_.select(self._allObjs,
                         function(o){return o.cur && o.cur.node == e.target;}));
                     if (!targetObj) return;
                     targetObj.cur.attr(SELECTED_ATTRS);
                     self._obj = targetObj;
                     self._start = cur;
                 } else {
                     throw "should not be reached";
                 }
             }).mouseup(function (e) {
                 if (1 != e.which) return;
                 e.preventDefault();

                 if (self._drawMode == 'r' || self._drawMode == 'e') {
                     if (!self._obj) return;
                     var metaObj = {
                         cur: self._obj,
                         scale: self._scale
                     };
                     if (self._drawMode == 'r') {
                         var as = self._obj.attr(["x", "y", "width", "height"]);
                         $.extend(metaObj, {
                             con: "rect",
                             args: [as.x, as.y, as.width, as.height]
                         });
                     } else if (self._drawMode == 'e') {
                         var as = self._obj.attr(["cx", "cy", "rx", "ry"]);
                         $.extend(metaObj, {
                             con: "ellipse",
                             args: [as.cx, as.cy, as.rx, as.ry]
                         });
                     } else {
                         throw "should not be reached";
                     }
                     var bbox = metaObj.cur.getBBox();
                     if (bbox.width > TOO_SMALL && bbox.height > TOO_SMALL) self._allObjs.push(metaObj);
                     self._start = self._obj = null;
                 } else if (self._drawMode == 'p') {
                     // do nothing
                 } else if (self._drawMode == 's') {
                     self._start = null; // stop moving
                     var o = self._obj;
                     if (o && o.newArgs) o.args = o.newArgs;
                 } else {
                     throw "should not be reached";
                 }
             }).mousemove(function (e) {
                 if (!self._obj) return;
                 e.preventDefault();

                 var cur = self._getCanvasXY(e);
                 if (self._drawMode == 'r' || self._drawMode == 'e') {
                     if (!self._obj) return;

                     var tl = {x: _.min([cur.x, self._start.x]), y: _.min([cur.y, self._start.y])},
                     br = {x: _.max([cur.x, self._start.x]), y: _.max([cur.y, self._start.y])},
                     halfWidth = (br.x-tl.x)/2,
                     halfHeight = (br.y-tl.y)/2;

                     if (self._drawMode == 'r') {
                         self._obj.attr({
                             x: tl.x, y: tl.y,
                             width: br.x - tl.x,
                             height: br.y - tl.y
                         });
                     } else if (self._drawMode == 'e') {
                         self._obj.attr({
                             cx: tl.x + halfWidth,
                             cy: tl.y + halfHeight,
                             rx: halfWidth,
                             ry: halfHeight
                         });
                     } else {
                         throw "should not be reached";
                     }
                 } else if (self._drawMode == 'p') {
                     if (!self._points) return;

                     var lp = _.last(self._points);
                     lp.x = cur.x;
                     lp.y = cur.y;
                     self._obj.attr({"path": makePathStr(self._points)});
                 } else if (self._drawMode == 's') {
                     if (!self._start || !self._obj) return;

                     var st = self._start;
                     var o = self._obj;
                     var rs = relScale(self, o);
                     var shift = {x: (cur.x-st.x)/rs, y: (cur.y-st.y)/rs};
                     var na = o.newArgs = shiftArgs(self._obj.con, self._obj.args, shift, rs);
                     if (o.con == "rect") {
                         o.cur.attr({x: na[0]*rs, y: na[1]*rs});
                     } else if (self._obj.con == "ellipse") {
                         o.cur.attr({cx: na[0]*rs, cy: na[1]*rs});
                     } else if (self._obj.con == "path") {
                         o.cur.attr({path: eachPoint(na[0], function(p){
                             return {x: p.x*rs, y: p.y*rs};
                         })});
                     } else {
                         throw "should not be reached";
                     }
                 } else {
                     throw "should not be reached";
                 }
             });
             // doesn't figure out if our canvas has focus
             // having multiple ops (in different canvases) seems pretty FUBAR, tho
             $(document).keydown(function(e) {
                 if (e.result == 1132423) return 1132423; // never again!

                 // if it's escape, stop what we're doing
                 if (e.keyCode === 27) {
                     if (self._obj) self._obj.remove();
                     self._start = self._obj = self._points = null;
                 } else if ((e.keyCode === 46 || e.keyCode === 8)
                           && self._drawMode == 's' && self._obj) {
                     // delete or backspace
                     var o = self._obj;
                     if (o && confirm("You are about to delete annotation. Is that okay?")) {
                         self._allObjs = _.reject(self._allObjs, function (c){return c == o;});
                         o.cur.remove();
                         self._start = self._obj = self._points = null;
                     }
                 }
                 return 1132423;
             });
         }
     });
})(jQuery, Raphael, _);

/* XXX revive overlayed objects for contrast
var p1 = paper.path("M10 10L90 90L10 90z");
p1.attr({"stroke": "black", "stroke-width": 1.5});
var p2 = paper.path("M10 10L90 90L10 90z");
p2.attr({"stroke": "white", "stroke-width": 0.5});
*/