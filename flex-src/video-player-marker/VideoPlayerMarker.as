import flash.events.Event;
import flash.media.Video;
import flash.net.NetConnection;
import flash.net.NetStream;
import flash.external.ExternalInterface;
import flash.events.IOErrorEvent;
import flash.system.Security;
import flash.display.Sprite;
import mx.controls.Alert;
import edu.umd.mith.axe.VideoClient;

protected const STATE_PLAYING:uint = 1;
protected const STATE_PAUSED:uint = 2;
protected const STATE_DONE:uint = 3;

protected var eid:String;
protected var videoURL:String;

protected var state:uint;

protected var video:Video;
protected var stream:NetStream;

protected var sought:Number;
protected var volume:Number;

protected var callbacks:Array = [
    "play", "pause", "seekTo", "setVolume", "getVolume", "getPosition",
    "getDuration", "getBytesTotal", "getBytesLoaded", "setMode"];

protected function errorHandler(e:IOErrorEvent):void {
    Alert.show("errorHandler: " + e.text);
}

public function whenAdded():void {
    cont.height = height = stage.height;
    cont.width = width = stage.width;
    state = STATE_DONE;
    sought = 0;
    volume = 1;
    videoURL = application.parameters.videoURL;
    eid = application.parameters.eid;
    if (application.parameters.backgroundColor) {
        setStyle("backgroundColor", application.parameters.backgroundColor);
    }

    var conn:NetConnection = new NetConnection();
    conn.connect(null);
    stream = new NetStream(conn);
    video = new Video();
    stream.client = new VideoClient(video, canvas);
    video.attachNetStream(stream);

    cont.rawChildren.addChildAt(video, 0);

    // XXX: redo
    //channel.addEventListener(Event.SOUND_COMPLETE, completed);

    // TODO: add event handler for resize, maybe try to set video size based on new stage size?

    ExternalInterface.marshallExceptions = true;
    callbacks.forEach(function (cb:*, index:int, array:Array):void {
        ExternalInterface.addCallback(cb, this[cb]);
    }, this);
    ExternalInterface.call("amReady", eid);

    // TODO: play until we get metadata, so that things work even if we start
    // at somewhere other than 0
    //stream.play(videoURL);
    //stream.soundTransform = new SoundTransform(0);
}

public function play():void {
    if (STATE_PLAYING == state) return;
    state = STATE_PLAYING;
    stream.play(videoURL);
    stream.seek(sought);
    stream.soundTransform = new SoundTransform(volume);
}

protected function completed(e:Event):void {
    state = STATE_DONE;
    sought = 0;
}

public function pause():void {
    stream.pause();
    sought = stream.time;
    state = STATE_PAUSED;
}

public function seekTo(time:Number):void {
    // hmm, we could perhaps implement more accurate seeking
    // by finding key frames (by seeking) and knowingly seeking to one
    // BEFORE time, hiding the video, muting it, and ony showing it when ready
    sought = time;
    if (STATE_PLAYING == state) stream.seek(time);
}

public function getPosition():Number {
    return stream.time;
}

public function setVolume(v:Number):void {
    volume = v;
    stream.soundTransform = new SoundTransform(volume);
}

public function getVolume():Number {
    return volume;
}

public function getDuration():Number {
    return 0; // XXX: dummy value. maybe metadata has it?
}

public function getBytesLoaded():Number {
    return stream.bytesLoaded;
}

public function getBytesTotal():Number {
    return stream.bytesTotal;
}

public function setMode(m:String):void {
    canvas.mode = m
}
