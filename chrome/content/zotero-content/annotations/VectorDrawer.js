(function ($, R, _, A) {
	var rootNS = this;

	// given a list of required parameter names (paramList), copy the properties
	// of the same name from paramsIn to paramsOut. If paramsIn doesn't have a
	// one or more of the properties, an exception will be thrown
	function loadReqParams(paramList, paramsIn, paramsOut) {
		_.each(paramsList, function(n) {
			if (!paramsIn.hasOwnProperty(n)) throw (n + " is a required parameter");
			paramsOut[n] = paramsIn[n];
		});
	}

	var shapes = {
		Rectangle: function(params) {
			this._params = {};
			loadReqParams(["paper", "x", "y", "width", "height"], params, this._params);
		},
		Ellipse: function(params) {
			this._params = {};
			loadReqParams(["paper", "cx", "cy", "rx", "ry"], params, this._params);
		},
		Polygon: function(params) {
			this._params = {};
			loadReqParams(["paper", "closed", "points"], params, this._params);
		}
	};

	$.extend(shapes.Rectangle.prototype, {
		isPointNear: function(p, tolerance) {	
		},
		redefineWith: function(p1, p2) {
		},
		remove: function() {	
		},
		savable: function() {	
		},
		shiftBy: function(x, y) {
		}
	});

	$.extend(shapes.Ellipse.prototype, {
		isPointNear: function(p, tolerance) {	
		},
		redefineWith: function(p1, p2) {
		},
		remove: function() {	
		},
		savable: function() {	
		},
		shiftBy: function(x, y) {
		}
	});

	$.extend(shapes.Polygon.prototype, {
		addPoint: function(p) {
		},
		close: function() {
		},
		isPointNear: function(p, tolerance) {	
		},
		remove: function() {	
		},
		savable: function() {	
		},
		shiftBy: function(x, y) {
		}
	});

	function makePathStr(ps) {
		return "M " + _.map(ps, function(p) {return p.x + " " + p.y;}).join(" L ");
	}

	function eachPoint(pathStr, func) {
		// copy without the beginning "M " or ending " z", then split on " L "
		var parts = pathStr.substr(2, path.length-4).split(" L ");
		var np = makePathStr(_.map(parts, function(p){
			var xy = p.split(" ");
			return func({x: xy[0]*1, y: xy[1]*1});
		}));
		return np + " z";

	}

	function shiftShape(o, shift) {
		var ret = {con: o.con, scale: o.scale};
		if (o.con == "rect") {
			ret.x = o.x + shift.x;
			ret.y = o.y + shift.y;
			ret.width = o.width;
			ret.height = o.height;
			ret.args = [ret.x, ret.y, ret.width, ret.height];
		} else if (o.con == "ellipse") {
			ret.cx = o.cx + shift.x;
			ret.cy = o.cy + shift.y;
			ret.rx = o.rx;
			ret.ry = o.ry;
			ret.args = [ret.cx, ret.cy, ret.rx, ret.ry];
		} else if (o.con == "path") {
			ret.points = _.map(o.points, function (p) {
				return {x: p.x+shift.x, y: p.y+shift.y};
			});
			ret.args = [makePathStr(ret.points) + " z"];
		} else {
			throw "should not be reached";
		}
		return ret;
	}

	function relScale(vd, o) {
		return vd._scale/o.scale;
	}

	// TODO: object-ify our shapes

	// TODO: make this take an object for options instead of a pile of
	// order-dependant args

	// initDrawMode should be one of the modes
	// overElm is the element that this VectorDrawer will be laid on top of
	// Note: the VectorDrawer will not move or resize if the element does

	/**
	 * Class: VectorDrawer
	 */
	/**
	 * Constructor: VectorDrawer
	 * Constructor for a new VectorDrawer
	 *
	 * Parameters:
	 * initDrawMode - {String} Initial draw mode. Should be one of 'r', 'p', 'e',
	 *   or 's' (for rectangle, polygon, ellipse, and select respectively).
	 *   Defaults to 's'.
	 * initScale - {Number} Initial scale of the image. Defaults to 1.
	 * initObjs - {Array} An initial set of objects (from VectorDrawer.savable). Defaults to []
	 * overElem - {jQuerySelector} The element to overlay with this VectorDrawer.
	 *   Can be a DOM element, string, etc. Defaults to "img" (the first image in the page)
	 */
	var VectorDrawer = function (params) {
		var DEFAULT_PARAMS = {
			auxClass: null,
			closeEnough: 8,
			drawMode: 's',
			epsilon: 10e-6,
			normalAttributes: {"stroke-width": "1px", "stroke": "#a12fae"},
			objects: [],
			selectedAttributes:{"stroke-width": "1px", "stroke": "#ff6666"},
			scale: 1,
			tooSmall: 2
		};
		var REQUIRED_PARAMS = ["overElement"];
		if (params === null) params = {};
		this._params = {};
		_.each(DEFAULT_PARAMS, _.bind(function(v,n) {
			this._params[n] = params.hasOwnProperty(n)? params[n] : v;
		}, this));
		loadReqParams(REQUIRED_PARAMS, params, this._params);

		this._geom = new A.Geometry({epsilon: this._params.epsilon});
		this._drawMode = this._params.drawMode;
		this._scale = this._params.scale;
		this._allObjs = this._params.objects;
		this._start = this._obj = this._points = null;

		// XXX: should handle wandering out of the area...
		var overElm = $(this._params.overElement || "img");
		this._over = {
			elm: $(overElm),
			offset: overElm.offset(),
			origWidth: overElm.width()/this._scale,
			origHeight: overElm.height()/this._scale};
		this._buildCanvas();
	};
	$.extend(VectorDrawer.prototype, {
		/**
		 * Method: drawMode
		 * Sets or gets the current drawMode. If no argument is given,
		 * returns the current drawMode.
		 *
		 * Parameters:
		 * drawMode - {String} the drawMode to set
		 */
		drawMode: function(newMode) {
			if (newMode != null) {
				if (self._obj) self._obj.cur.attr(this._params.normalAttributes);
				this._drawMode = newMode;
			}
			return this._drawMode;
		},
		/**
		 * Method: scale
		 * Sets or gets the current scale. If no argument is given,
		 * returns the current scale. This will attempt to resize the element
		 * that this VectorDrawer overlays.
		 *
		 * Parameters:
		 * scale - {Number} the scale to set
		 */
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
		/**
		 * Method: savable
		 * Returns an array representing all the shapes/objects currently drawn
		 * by this VectorDrawer. These should not be fiddled with if you plan
		 * to pass them to the constructor as its initObjs argument.
		 */
		savable: function() {
			return _.map(this._allObjs, function(o){
				var r = {};
				_.each(["scale", "con", "args", "x", "y", "width", "height",
					"points", "cx", "cy", "rx", "ry", "auxData"],
					function (p) {if (p in o) r[p] = o[p];});
				return r;
			});
		},
		_isNear: function (p, o) {
			if (o.con == "rect") {
				var farX = o.x+o.width, farY = o.y+o.height;
				var ul = {x: o.x, y: o.y}, ur = {x: farX, y:o.y},
					ll = {x: o.x, y: farY}, lr = {x: farX, y:farY};
				return _.any([[ul, ur], [ur, lr], [lr, ll], [ll, ul]], _.bind(function (seg){
								return this._geom.isPointNearLineSegment(seg[0], seg[1], p, this._params.closeEnough);
							 }, this));
			} else if (o.con == "ellipse") {
				return Math.abs(this._geom.pointDistanceFromEllipse(p, o)) < this._params.closeEnough;
			} else if (o.con == "path") {
				// convert list of points into pairs of points for line segments
				var line_segs = _.map(o.points, function (po, i){
					return [i?o.points[i-1] : _.last(o.points), po];
				});
				return _.any(line_segs, _.bind(function (l){
					return this._geom.isPointNearLineSegment(l, p, this._params.closeEnough);
				}, this));
			} else {
				throw "should not be reached";
			}
		},
		_buildCanvas: function() {
			var self = this;
			self._cont = self._cont || $("<div class=\"vd-container\"></div>").appendTo("body");
			self._cont.css({left: self._over.offset.left, top: self._over.offset.top, position: "absolute"});
			self._paper = R(self._cont[0],
				self._over.elm.width(), self._over.elm.height());
			self._canvas = {elm:$(self._paper.canvas)};
			self._canvas.off = self._canvas.elm.offset();
			self._over.offset = self._over.elm.offset();
			self._installHandlers();
			_.each(self._allObjs, _.bind(function (o) {
				o.cur = self._paper[o.con].apply(self._paper, o.args);
				var rs = relScale(self, o);
				o.cur.scale(rs, rs, 0, 0);
				o.cur.attr(this._params.normalAttributes);
			}, this));
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

			self._cont.mousedown(_.bind(function(e) {
				if (1 != e.which) return;
				e.preventDefault();

				var cur = self._getCanvasXY(e);
				if (self._drawMode == 'r') {
					self._start = cur;
					self._obj = self._paper.rect(self._start.x, self._start.y, 0, 0);
					self._obj.attr(this._params.normalAttributes);
				} else if (self._drawMode == 'e') {
					self._start = cur;
					self._obj = self._paper.ellipse(self._start.x, self._start.y, 0, 0);
					self._obj.attr(this._params.normalAttributes);
				} else if (self._drawMode == 'p') {
					if (self._points) {
						var f = _.first(self._points);
						var a = cur.x - f.x,
							b = cur.y - f.y;
						var maybeClosing = false;
						if (Math.sqrt(a*a + b*b) < this._params.closeEnough) {
							maybeClosing = true;
						}
						if (self._points.length > 2) {
							// if we're closing the polygon,
							// then we skip the first line
							var inter = false,
								ps = self._points.slice(maybeClosing? 2:1, -2),
								lp = self._points[maybeClosing? 1 : 0],
								pcur = self._points[self._points.length-2];
							_.each(ps, _.bind(function(cp) {
								if (self._geom.doLineSegmentsIntersect(lp, cp, pcur, cur)) {
									inter = true;
									_.breakLoop();
								}
								lp = cp;
							}, this));
							// intersection detected, don't use this
							if (inter) return;
						}
						if (maybeClosing) {
							self._points.pop();
							var path = makePathStr(self._points) + " z";
							self._obj.attr({"path": path});
							var bbox = self._obj.getBBox();
							if (bbox.width > this._params.tooSmall && bbox.height > this._params.tooSmall) {

								self._allObjs.push({
									cur: self._obj,
									con: "path",
									args: [path],
									points: self._points,
									scale: self._scale
								});
							}
							self._obj = self._points = null;
							return; // done!
						}
					} else {
						self._points = [cur];
						self._obj = self._paper.path(makePathStr(self._points));
						self._obj.attr(this._params.normalAttributes);
					}
					self._points.push({x: cur.x, y: cur.y});
				} else if (self._drawMode == 's') {
					if (self._obj) {
						self._obj.cur.attr(this._params.normalAttributes);
						if (self._params.auxClass && self._obj.curAux) {
							self._obj.auxData = self._obj.curAux.close();
							delete self._obj.curAux;
						}
					}
					self._obj = null;
					var targetObj = _.first(_.select(self._allObjs,
						_.bind(function(o){
							return this._isNear(cur, o);
						}, this)));
					if (!targetObj) return;
					targetObj.cur.attr(this._params.selectedAttributes);
					if (self._params.auxClass && !targetObj.curAux) {
						targetObj.curAux = new self._params.auxClass(targetObj.auxData, {x: e.clientX, y: e.clientY});
					}
					self._obj = targetObj;
					self._start = cur;
				} else {
					throw "should not be reached";
				}
			}, this)).mouseup(_.bind(function (e) {
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
							args: [as.x, as.y, as.width, as.height],
							x: as.x,
							y: as.y,
							width: as.width,
							height: as.height
						});
					} else if (self._drawMode == 'e') {
						var as = self._obj.attr(["cx", "cy", "rx", "ry"]);
						$.extend(metaObj, {
							con: "ellipse",
							args: [as.cx, as.cy, as.rx, as.ry],
							cx: as.cx,
							cy: as.cy,
							rx: as.rx,
							ry: as.ry
						});
					} else {
						throw "should not be reached";
					}
					var bbox = metaObj.cur.getBBox();
					if (bbox.width > this._params.tooSmall && bbox.height > this._params.tooSmall) self._allObjs.push(metaObj);
					self._start = self._obj = null;
				} else if (self._drawMode == 'p') {
					// do nothing
				} else if (self._drawMode == 's') {
					self._start = null; // stop moving
					var o = self._obj;
					if (o && o.newO) {
						_.each(["scale", "con", "args", "x", "y", "width", "height",
							"points", "cx", "cy", "rx", "ry"],
							function (p) {if (p in o) o[p] = o.newO[p];});
					}
				} else {
					throw "should not be reached";
				}
			}, this)).mousemove(_.bind(function (e) {
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
					o.newO = shiftShape(o, shift);
					if (o.con == "rect") {
						o.cur.attr({x: o.newO.x*rs, y: o.newO.y*rs*rs});
					} else if (self._obj.con == "ellipse") {
						o.cur.attr({cx: o.newO.cx*rs, cy: o.newO.cy*rs});
					} else if (self._obj.con == "path") {
						o.cur.attr({path: makePathStr(_.each(o.newO.points, function(p){
							return {x: p.x*rs, y: p.y*rs};
						})) + " z"});
					} else {
						throw "should not be reached";
					}
				} else {
					throw "should not be reached";
				}
			}, this));
			// doesn't figure out if our canvas has focus
			// having multiple ops (in different canvases) seems pretty FUBAR, tho
			$(document).keydown(_.bind(function(e) {
				// we use this to avoid acting on the same event repeatedly
				var PREV_VAL = 1132423;
				if (e.result == PREV_VAL) return PREV_VAL;

				// if it's escape, stop what we're doing
				if (e.keyCode === 27) {
					if (self._obj) self._obj.remove();
					self._start = self._obj = self._points = null;
				} else if ((e.keyCode === 46 || e.keyCode === 8)
						  && self._drawMode == 's') {
					// delete or backspace
					e.preventDefault();
					if (!self._obj) return PREV_VAL;
					var o = self._obj;
					if (o && confirm("You are about to delete annotation. Is that okay?")) {
						self._allObjs = _.reject(self._allObjs, function (c){return c == o;});
						o.cur.remove();
						self._start = self._obj = self._points = null;
					}
				}
				return PREV_VAL;
			}, this));
		}
	});

	rootNS.VectorDrawer = VectorDrawer;
})(jQuery, Raphael, _, AXE);

/* XXX revive overlayed objects for contrast
var p1 = paper.path("M10 10L90 90L10 90z");
p1.attr({"stroke": "black", "stroke-width": 1.5});
var p2 = paper.path("M10 10L90 90L10 90z");
p2.attr({"stroke": "white", "stroke-width": 0.5});
*/
