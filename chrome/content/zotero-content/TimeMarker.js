// dependencies: jQuery, underscore.js
(function ($, _) {

var rootNS = this;

function makeClasses(formatTime) {
    
    // private class
    function TimeStamp(t) {
        this.t = t;
    }

    jQuery.extend(TimeStamp.prototype, {
        sortVal: function () {
            return this.t;
        },
        toString: function () {
            return formatTime(this.t);
        }
    });

    // private class
    function TimeRange(s, e) {
        this.startT = _.min([s, e]);
        this.endT = _.max([s, e]);
    }

    jQuery.extend(TimeRange.prototype, {
        sortVal: function () {
            return this.startT;
        },
        toString: function () {
            return "" + formatTime(this.startT) + " to " + formatTime(this.endT);
        }
    });

    return {
        TimeStamp: TimeStamp,
        TimeRange: TimeRange
    };
}

// inserts o into a, using iter (if present) to compute sort value
function insertIntoSorted(a, o, iter) {
    var i = _.sortedIndex(a, o, iter);
    a.splice(i, 0, o);
}

// player: must return a time (as a Number) when its getPosition method is called
// container: must be an Element, Document, or jQuery selector
// formatTime: should take a time and return a string (HTML) for it
// initState: could be the value returned by a call to savable
rootNS.TimeMarker = function (opts) {
    var reqOpts = ["container", "player"];
    var missingOpts = _.reject(reqOpts, function (p) {return opts.hasOwnProperty(p);});
    if (missingOpts.length)
        throw "Missing required option(s) " + missingOpts.join(", ");

    var defaultOpts = {
        initState: [{moments: [], ranges: []}],
        formatTime: function (t) {return ""+t;}
    };
    _.each(defaultOpts, function (v, p) {
        if (!opts.hasOwnProperty(p)) opts[p] = v;
    });
    // stupid edge case created by not storing things the way model expects (as an array)
    if (!opts.initState.length) opts.initState = defaultOpts.initState;

    var self = this;
    self._container = $(opts.container);
    self._player = opts.player;

    var tmp = makeClasses(opts.formatTime);
    self._TimeStamp = tmp.TimeStamp;
    self._TimeRange = tmp.TimeRange;

    self._container.html(
        "<ul class='time-marker-moment-list'></ul>" +
        "<ul class='time-marker-range-list'></ul>");
    // TODO: store these individually instead of just using the first element of the array
    self._momentList = $(".time-marker-moment-list", self._container);
    self._moments = _.map(opts.initState[0].moments, function (m) {
        return new self._TimeStamp(m);
    });
    self.displayMoments();

    self._start = null;
    self._rangeList = $(".time-marker-range-list", self._container);
    self._ranges = _.map(opts.initState[0].ranges, function (r) {
        return new self._TimeRange(r.startT, r.endT);
    });
    self.displayRanges();
};

jQuery.extend(rootNS.TimeMarker.prototype, {
    savable: function() {
        var self = this;
        return [{
            moments: _.map(self._moments, function (m) {
                return m.t;
            }),
            ranges: _.map(self._ranges, function (r) {
                return {startT: r.startT, endT: r.endT};
            })
        }];
    },
    markNow: function() {
        self = this;
        insertIntoSorted(self._moments,
            new self._TimeStamp(self._player.getPosition()),
            function (ts){return ts.sortVal();});
        self.displayMoments();
    },
    markStartEnd: function() {
        self = this;
        if (self._start !== null) {
            insertIntoSorted(self._ranges,
                new self._TimeRange(self._start, self._player.getPosition()),
                function (tr){return tr.sortVal();});
            self.displayRanges();
            self._start = null;
        } else {
            self._start = self._player.getPosition();
        }
    },
    displayMoments: function() {
        this._momentList.html(this._moments.length ? ("<li>" + this._moments.join("</li><li>") + "</li>") : "");
    },
    displayRanges: function() {
        this._rangeList.html(this._ranges.length ? ("<li>" + this._ranges.join("</li><li>") + "</li>") : "");
    }
});

})(jQuery, _);
