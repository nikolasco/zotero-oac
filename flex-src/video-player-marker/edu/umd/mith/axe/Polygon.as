package edu.umd.mith.axe {

import flash.display.Graphics;
import flash.geom.Point;

internal class Polygon implements VectorShape {
	private var points:Array = null;
	// note that ps is NOT copied (just referenced)
	public function Polygon(ps:Array) {
		points = ps;
	}
	public function drawSelf(g:Graphics):void {
		var l:uint = points.length;
		var p:Point = poinits[0];
		// get into position
		g.moveTo(p.x, p.y);
		for(var i:uint = 1; i < l; i++) {
			p = points[i];
			g.lineTo(p.x, p.y);
		}
		// close the polygon
		p = points[0];
		g.lineTo(p.x, p.y);
	}

	public function get savable():Object {
		return {
			klass: "Polygon",
			points: points,
		};
	}
}

}
