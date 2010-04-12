package edu.umd.mith.axe {

import flash.display.DisplayObject;
import flash.display.DisplayObjectContainer;
import flash.media.Video;
import mx.controls.Alert;
import flash.external.ExternalInterface;

public class BootVideoClient {
    protected var video:Video;
    protected var other:DisplayObject;
    protected var cont:Function;
    public function BootVideoClient(v:Video, o:DisplayObject, c:Function) {
        video = v;
        other = o;
        cont = c;
    }

    public function onCuePoint(info:Object):void {
    }
    public function onImageData(info:Object):void {
    }
    public function onMetaData(info:Object):void {
        var divW:Number, divH:Number, p:DisplayObjectContainer = video.parent;
        if (p) {
            divW = p.width/info.width;
            divH = p.height/info.height;
        } else {
            divW = divH = 1;
        }
        var scale:Number = divW < divH? divW : divH;
        video.width = info.width*scale;
        video.height = info.height*scale;
        if (p) {
            video.x = (p.width - video.width)/2;
            video.y = (p.height - video.height)/2;
        }
        if (other) {
            other.x = video.x;
            other.y = video.y;
            other.width = video.width;
            other.height = video.height;
        }
        cont(info.duration);
    }
    public function onPlayStatus(info:Object):void {
    }
    public function onTextData(info:Object):void {
    }
}

}
