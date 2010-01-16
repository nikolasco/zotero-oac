(function ($, R, _) {
     var rootNS = this;
     var CLOSE_ENOUGH = 8;
     var INIT_ATTRS = {"stroke-width": "1px", "stroke-color": "black"};

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

     // initDrawMode should be one of the modes
     // overElm is the element that this VectorDrawer will be laid on top of
     // Note: the VectorDrawer will not move or resize if the element does
     rootNS.VectorDrawer = function (initDrawMode, initScale, overElm) {
         var self = this;
         // only thing that methods access at the moment
         self._drawMode = initDrawMode;
         self._scale = initScale;
         self._allObjs = [];
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
                 var relScale = self._scale/o.scale;
                 o.cur.scale(relScale, relScale, 0, 0);
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
                             self._allObjs.push({
                                 cur: self._obj,
                                 con: "path",
                                 args: [path],
                                 scale: self._scale
                             });
                             self._obj = self._points = null;
                             return; // done!
                         }
                     } else {
                         self._points = [cur];
                         self._obj = self._paper.path(makePathStr(self._points));
                         self._obj.attr(INIT_ATTRS);
                     }
                     self._points.push({x: cur.x, y: cur.y});
                 } else {
                     throw "should not be reached";
                 }
             }).mouseup(function (e) {
                 if (1 != e.which) return;

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
                     self._allObjs.push(metaObj);
                     self._start = self._obj = null;
                 } else if (self._drawMode == 'p') {
                     // do nothing
                 } else {
                     throw "should not be reached";
                 }
             }).mousemove(function (e) {
                 if (!self._obj) return;

                 var cur = self._getCanvasXY(e);
                 if (self._drawMode == 'r' || self._drawMode == 'e') {
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
                     var lp = _.last(self._points);
                     lp.x = cur.x;
                     lp.y = cur.y;
                     self._obj.attr({"path": makePathStr(self._points)});
                 } else {
                     throw "should not be reached";
                 }
             });
             // doesn't figure out if our canvas has focus
             // having multiple ops (in different canvases) seems pretty FUBAR, tho
             $(document).keydown(function(e) {
                 // if it's escape, stop what we're doing
                 if (e.keyCode === 27) {
                     self._obj.remove();
                     self._start = self._obj = self._points = null;
                 }
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