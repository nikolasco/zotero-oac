package edu.umd.mith.axe {

import flash.display.Graphics;

internal interface VectorShape {
    function drawSelf(g:Graphics):void;
    function get savable():Object;
}

}