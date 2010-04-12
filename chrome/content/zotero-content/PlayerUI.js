(function ($, _) {
    var rootNS = this;

    function parseTime(s) {
        var m = /(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)/.exec(s);
        var ret = 0;
        if (m[1]) ret += m[1]*(m[2]? 60:1)*60;
        if (m[2]) ret += m[2]*60;
        if (m[3]) ret += m[3];
        return ret;
    }

	
    rootNS.PlayerUI = function (opts) {
        var self = this;
        self._container = $(opts.container);
        self._player = opts.player;

        self._container.html(
            "<div class='player-ui-play'>Play</div>" +
            "<div class='player-ui-pause'>Pause</div>" +
            "<div>Loaded <span class='player-ui-loaded'></span> out of " +
                "<span class='player-ui-size'></span>" + 
                "(<span class='player-ui-loaded-perc'></span>%)</div>" +
            "<div>Volume: <span class='player-ui-volume'></span>%</div>" +
                        "<div id='player-ui-new-volume'></div>"+
                  "<div>Playing: <div id='player-ui-seek'></div>" +
            "<div><span class='player-ui-pos'></span> out of " +
                "<span class='player-ui-length'></span></div>"+
                "<script type='text/JavaScript' language='JavaScript'>"+
                "volumeSlide=$('#player-ui-new-volume').slider({"+
			"min:0,max:100,stop:function(e,ui){$(this).trigger('volumeChange',['vol',ui.value]);}});"+
			  "progressSlide=$('#player-ui-seek').slider({"+
			"min:0,max:100,start:function(e,ui){p.pause();$(this).trigger('posStartChange',['seek',ui.value]);},stop:function(e,ui){$(this).trigger('slideChange',['seek',ui.value]);}});$('#player-ui-new-volume').slider('option','value',100);"+
			""+
			"</script>"
			
		);
		self.changeVolume=function(e,slider,val){
			var v = val;
            var m = /\d+/.exec(v);
            if (m) p.setVolume(m[0]/100);
		}
		self.startPosChange=function(e,slider,val){
			self._isPlaying = false;
		}
        self.seekToPos=function(e,slider,val){
		
	
			
 			var percent = parseInt((val*p.getDuration())/100);
 			
 			p.seekTo(parseTime(percent));
            
	}     	
		self._isPlaying = false;
		
        var p = self._player,
            newVol = $(".player-ui-new-volume", self._container),
            seekTime = $(".player-ui-seek-time", self._container);
  $("#player-ui-new-volume").bind("volumeChange",{obj:self},self.changeVolume);
          $("#player-ui-seek").bind("posStartChange",{obj:self},self.startPosChange); 
       $("#player-ui-seek").bind("slideChange",{obj:self},self.seekToPos);
        $(".player-ui-play", self._container).click(function () {self._isPlaying=true;p.play();});
        $(".player-ui-pause", self._container).click(function () {self._isPlaying=false;p.pause();});

 
        $("form", self._container).submit(function(e){e.preventDefault();});
       window.setInterval(function () {
            $(".player-ui-pos", self._container).text(self.formatTime(p.getPosition()));
            var percent = parseInt(100*(p.getPosition()/p.getDuration()));
            if (self._isPlaying){
            	$( "#player-ui-seek" ).slider( "option", "value", percent );
            }
            $(".player-ui-length", self._container).text(self.formatTime(p.getDuration()));
            $(".player-ui-volume", self._container).text(Math.round(p.getVolume()*100));
            var loa = p.getBytesLoaded(), len = p.getBytesTotal();
            $(".player-ui-loaded", self._container).text(loa);
            $(".player-ui-size", self._container).text(len);
            $(".player-ui-loadedPerc", self._container).text(Math.round(loa/len)*100);
            
        }, 100);
    };	
	
    $.extend(rootNS.PlayerUI.prototype, {
        formatTime: function (s) {
            var l = p.getDuration();
            var h = Math.floor(s/(60*60));
            s %= 60*60;
            var m = Math.floor(s/(60));
            s %= 60;
            s = Math.floor(s);

            return _.map([h, m, s], function (n) {
                return n > 0 ? ((n < 10 ? "0" : "") + n) : "00";
            }).join(":");
        }
    });

})(jQuery, _);
