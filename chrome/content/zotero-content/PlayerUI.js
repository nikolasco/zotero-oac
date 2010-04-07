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
            "<div><form><input class='player-ui-new-volume' type='text'></input> " +
                "<span class='player-ui-set-volume'>Set Volume!</span></form></div>" +
            "<div>Volume: <span class='player-ui-volume'></span>%</div>" +
            "<div><form><input class='player-ui-seek-time' type='text'></input> " +
                "<span class='player-ui-seek'>Seek!</span></form></div>" +
            "<div><span class='player-ui-pos'></span> out of " +
                "<span class='player-ui-length'></span></div>");

        var p = self._player,
            newVol = $(".player-ui-new-volume", self._container),
            seekTime = $(".player-ui-seek-time", self._container);
        $(".player-ui-play", self._container).click(function () {p.play();});
        $(".player-ui-pause", self._container).click(function () {p.pause();});
        $(".player-ui-seek", self._container).click(function () {
            p.seekTo(parseTime(seekTime.val()));
        });
        $(".player-ui-set-volume", self._container).click(function () {
            var v = newVol.val();
            var m = /\d+/.exec(v);
            if (m) p.setVolume(m[0]/100);
        });
        $(".player-ui-pos", self._container).text(self.formatTime(p.getPosition()));
        $("form", self._container).submit(function(e){e.preventDefault();});
        window.setInterval(function () {
            $(".player-ui-pos", self._container).text(self.formatTime(p.getPosition()));
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