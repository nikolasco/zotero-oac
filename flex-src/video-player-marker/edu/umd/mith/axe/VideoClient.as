package edu.umd.mith.axe {

import flash.display.DisplayObject;
import flash.display.DisplayObjectContainer;
import flash.media.Video;
import mx.controls.Alert;

public class VideoClient {
    protected var video:Video;
    protected var other:DisplayObject;
    public function VideoClient(v:Video, o:DisplayObject) {
        video = v;
        other = o;
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
    }
    public function onPlayStatus(info:Object):void {
    }
    public function onTextData(info:Object):void {
    }
}

}
