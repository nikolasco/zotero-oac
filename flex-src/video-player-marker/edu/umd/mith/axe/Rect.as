package edu.umd.mith.axe {

import flash.display.Graphics;
import flash.geom.Point;

// NOTE: named Rect to avoid conflict with flash.geom.Rectangle
internal class Rect extends XYWidthHeightShape implements VectorShape {
    public function Rect(p1:Point, p2:Point) {
        super(p1, p2);
    }

    public function drawSelf(g:Graphics):void {
        g.drawRect(x, y, width, height);
    }

    public function get savable():Object {
        return {
            klass: "Rectangle",
            p1: {x: x, y: y},
            p2: {x: x+width, y: y+height}
        };
    }
}

}