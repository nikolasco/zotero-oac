package edu.umd.mith.axe {

import flash.display.DisplayObject;
import flash.display.DisplayObjectContainer;
import flash.media.Video;
import mx.controls.Alert;
import flash.external.ExternalInterface;

public class EmptyVideoClient {
    protected var video:Video;
    protected var other:DisplayObject;
    protected var cont:Function;
    public function EmptyVideoClient() {
    }

    public function onCuePoint(info:Object):void {
    }
    public function onImageData(info:Object):void {
    }
    public function onMetaData(info:Object):void {
    }
    public function onPlayStatus(info:Object):void {
    }
    public function onTextData(info:Object):void {
    }
}

}
