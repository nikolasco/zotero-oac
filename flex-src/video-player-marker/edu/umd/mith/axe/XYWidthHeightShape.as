package edu.umd.mith.axe {

import flash.geom.Point;

internal class XYWidthHeightShape {
  protected var x:Number, y:Number, width:Number, height:Number;
  
  public function XYWidthHeightShape(p1:Point, p2:Point) {
    x = p1.x < p2.x ? p1.x : p2.x;
    y = p1.y < p2.y ? p1.y : p2.y;
    width = (p1.x > p2.x ? p1.x : p2.x) - x;
    height = (p1.y > p2.y ? p1.y : p2.y) - y;
  }
}


}