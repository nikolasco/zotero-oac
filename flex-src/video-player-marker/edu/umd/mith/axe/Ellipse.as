package edu.umd.mith.axe {

import flash.display.Graphics;
import flash.geom.Point;

internal class Ellipse extends XYWidthHeightShape implements VectorShape {
	public function Ellipse(p1:Point, p2:Point) {
		super(p1, p2);
	}

	public function drawSelf(g:Graphics):void {
		g.drawEllipse(x, y, width, height);
	}

	public function get savable():Object {
		return {
			klass: "Ellipse",
			p1: {x: x, y: y},
			p2: {x: x+width, y: y+height}
		};
	}
}

}
