#!/bin/sh

OUT_DIR=../chrome/content/zotero-content

if [ -z $MXMLC ]; then MXMLC=mxmlc; fi

$MXMLC -debug -output $OUT_DIR/VideoPlayerMarker.swf video-player-marker/VideoPlayerMarker.mxml
$MXMLC -debug -output $OUT_DIR/AudioPlayer.swf audio-player/AudioPlayer.mxml
