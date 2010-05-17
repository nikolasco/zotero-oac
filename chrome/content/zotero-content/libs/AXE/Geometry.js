(function ($, _) {
	var rootNS = this;

	rootNS.AXE.Geometry = function(params) {
		if (params === null) params = {};
		var DEFAULT_PARAMS = {
			epsilon: 10e-6
		};
		this._params = {};
		_.each(DEFAULT_PARAMS, _.bind(function(v,n) {
			this._params[n] = params.hasOwnProperty(n)? params[n] : v;
		}, this));
	};

	$.extend(rootNS.AXE.Geometry.prototype, {
		whereLinesIntersect: function (a1, a2, b1, b2) {
			var bXdiff = b1.x-b2.x, bYdiff = b1.y-b2.y;
			var aXdiff = a1.x-a2.x, aYdiff = a1.y-a2.y;
			var aDet = a1.x*a2.y - a1.y*a2.x, bDet = b1.x*b2.y - b1.y*b2.x,
				denom = aXdiff*bYdiff - aYdiff*bXdiff;
			var interX = (aDet*bXdiff - aXdiff*bDet)/denom,
				interY = (aDet*bYdiff - aYdiff*bDet)/denom;
			return {x: interX, y: interY};
		},

		// given the endpoints (a1,a2,b1,b2) of two line segments,
		// determine if they intersect
		doLineSegmentsIntersect: function (a1, a2, b1, b2) {
			var i = this.whereLinesIntersect(a1, a2, b1, b2);
			// check if it's within the segment
			return i.x > _.min([a1.x,a2.x]) && i.x < _.max([a1.x,a2.x]) &&
				i.y > _.min([a1.y,a2.y]) && i.y < _.max([a1.y,a2.y]) &&
				i.x > _.min([b1.x,b2.x]) && i.x < _.max([b1.x,b2.x]) &&
				i.y > _.min([b1.y,b2.y]) && i.y < _.max([b1.y,b2.y]);
		},

		// returns the distance between two points (a, b) squared
		pointDistanceSquared: function(a, b) {
			var dx = a.x-b.x, dy = a.y-b.y;
			return dx*dx + dy*dy;
		},

		// returns the distance between two points (a, b)
		pointDistance: function(a, b) {
			return Math.sqrt(this.pointDistanceSquared(a, b));
		},

		// given the endpoints of a line segment (a1, a2) determine if
		// a point (p) is within a particular distance (tol) of the segment
		isPointNearLineSegment: function (a1, a2, p, tol) {
			var epsilon = this._params.epsilon;
			// easy case: we're within range of the endpoints
			if (_.any([a1, a2], _.bind(function (lp) {
					return this.pointDistanceSquared(lp, p) < tol*tol;
				}, this))) {
				return true;
			}

			// calculate nearest point on the line (point such that it
			// and the queried point form a line segment orthogonal to
			// the queried line segment)
			var ldx = a1.x-a2.x, ldy = a1.y-a2.y;
			var lslope = ldx/ldy;

			var dumP; // dummy point
			if (isFinite(lslope)) {
				dumP = (lslope < epsilon && lslope > -epsilon) ?
					{x: p.x + 10, y: p.y} : {x: p.x - 10*lslope, y: p.y+10};
			} else {
				dumP = {x: p.x, y: p.y + 10};
			}

			var i = this.whereLinesIntersect(a1, a2, dumP, p);

			// is this point actually within the queried line segment?
			if (i.x < _.min([a1.x, a2.x]) ||
				i.x > _.max([a1.x, a2.x]) ||
				i.y < _.min([a1.y, a2.y]) ||
				i.y > _.max([a1.y, a2.y]))
				return false;

			return this.pointDistanceSquared(i, p) < tol*tol;
		},

		pointDistanceFromEllipse: function(po, eo) {
			// algorithm described in
			// "Quick computation of the distance between a point and an ellipse"
			// by L. Maisonobe <luc@spaceroots.org>
			// September 2003, revised May 2005, minor revision February 2006

			var epsilon = this._params.epsilon;
			var one_third = 1/3;
			var cube_root = function(n) {
				var cube_root_abs_n = Math.pow(Math.abs(n), one_third);
				return n < 0? -cube_root_abs_n : cube_root_abs_n;
			};

			// ae = major axis
			// ap = minor axis
			// r = distance from center along major axis
			// z = distance from center along minor axis
			var ae, ap, r, z;
			if (eo.rx > eo.ry) {
				ae = eo.rx;
				ap = eo.ry;
				r = po.x-eo.cx;
				z = po.y-eo.cy;
			} else {
				ae = eo.ry;
				ap = eo.rx;
				r = po.y-eo.cy;
				z = po.x-eo.cx;
			}
			// by symmetry, we don't care about signs
			r = Math.abs(r);
			z = Math.abs(z);

			// f = flattening
			var f = 1 - ap/ae;
			var one_minus_f_sq = Math.pow((1-f), 2);

			var p_dist_center = Math.sqrt(r*r + z*z);

			// near center requires special handling
			if (p_dist_center < epsilon)
				return ap;

			var cos_zeta = r/p_dist_center,
				sin_zeta = z/p_dist_center,
				t = z/(r + p_dist_center);
			var a = one_minus_f_sq*cos_zeta*cos_zeta + sin_zeta*sin_zeta,
				b = one_minus_f_sq*r*cos_zeta + z*sin_zeta,
				c = one_minus_f_sq*(r*r - ae*ae) + z*z;
			var k = c/(b + Math.sqrt(b*b - a*c));
			var phi = Math.atan2(z - k*sin_zeta, one_minus_f_sq*(r-k*cos_zeta));
			var one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq = c;

			if (Math.abs(k) < epsilon*p_dist_center) {
				return k;
			}

			var inside = one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq <= 0;

			var calc_tilde_phi = function(z_, tilde_t_, r_, k_) {
				var tilde_t_sq = tilde_t_*tilde_t_;
				return Math.atan2(z_*(1+tilde_t_sq)-2*k_*tilde_t_,
						one_minus_f_sq*(r_*(1+tilde_t_sq) - k_*(1-tilde_t_sq)));
			};

			var d;
			for (var iter = 0; iter < 100; iter++) {
				// paper Java differ on computing a and c. Java works
				a = one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq + one_minus_f_sq*(2*r + k)*k;
				b = -4*k*z/a;
				c = 2*(one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq + (1 + f*(2-f))*k*k)/a;
				d = b;

				// paper and Java differ here too. Again, Java works
				b += t;
				c += t*b;
				d += t*c;

				// find the other real root
				var Q = (3*c - b*b)/9,
					R = (b*(9*c - 2*b*b) - 27*d)/54;
				var D = Q*Q*Q + R*R;
				var tilde_t, tilde_phi;
				if (D >= 0) {
					var sqrt_D = Math.sqrt(D);
					tilde_t = cube_root(R + sqrt_D) + cube_root(R - sqrt_D) - b/3;
					tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
				} else {
					Q = -Q;
					var sqrt_Q = Math.sqrt(Q);
					var theta = Math.acos(R/(Q*sqrt_Q));
					tilde_t = 2*sqrt_Q*Math.cos(theta/3) - b/3;
					tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
					if (tilde_phi*phi < 0) {
						tilde_t = 2*sqrt_Q*Math.cos((theta + 2*Math.PI)/3) - b/3;
						tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
						if (tilde_phi*phi < 0) {
							tilde_t = 2*sqrt_Q*Math.cos((theta + 4*Math.PI)/3) - b/3;
							tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
						}
					}
				}

				var delta_phi = Math.abs(tilde_phi - phi)/2;
				phi = Math.abs(tilde_phi + phi)/2;

				var cos_phi = Math.cos(phi), sin_phi = Math.sin(phi);
				var sin_phi_sq = sin_phi*sin_phi;
				var sqrt_stuff = Math.sqrt(1 - f*(2-f)*sin_phi_sq);
				if (delta_phi < epsilon) {
					return r*cos_phi + z*sin_phi - ae*sqrt_stuff;
				}

				var delta_r = r - (ae*cos_phi)/sqrt_stuff,
					delta_z = z - (ae*one_minus_f_sq*sin_phi)/sqrt_stuff;
				k = Math.sqrt(delta_r*delta_r + delta_z*delta_z);
				if (inside) k = -k;
				t = delta_z/(delta_r + k);
			}

			// instead of emitting an error, return our best
			return r*cos_phi + z*sin_phi - ae*sqrt_stuff;
		}
	});
})(jQuery, _);
