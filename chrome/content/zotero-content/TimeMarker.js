// dependencies: jQuery, underscore.js
(function ($, _) {

var rootNS = this;

function makeClasses(formatTime) {
    
    // private class
    function TimeStamp(t,i) {
    	
        this.t = t;
        this.id = i;
        this.note = "Click here to leave a note.";
    }

    jQuery.extend(TimeStamp.prototype, {
        sortVal: function () {
            return this.t;
        },
        toString: function () {
            return formatTime(this.t);
        },
        saveNote: function(note){
        this.note=note;
        }
    });

    // private class
    function TimeRange(s, e, i) {
        this.startT = _.min([s, e]);
        this.endT = _.max([s, e]);
        this.id = i;
        this.note="Click here to leave a note.";
    }

    jQuery.extend(TimeRange.prototype, {
        sortVal: function () {
            return this.startT;
        },
        toString: function () {
            return "" + formatTime(this.startT) + " to " + formatTime(this.endT);
        },
          saveNote: function(note){
        this.note=note;
        }
    });

    return {
        TimeStamp: TimeStamp,
        TimeRange: TimeRange
    };
}

// inserts o into a, using iter (if present) to compute sort value
function insertIntoSorted(a, o, iter) {
    //var i = _.sortedIndex(a, o, iter);
    i=iter;
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
        "<h3>Marked Moments</h3><table class='time-marker-moment-list'>"
        +"<tr class='time-marker-moment-header'>"
	    +"             <th>Time range</th>"+
	    +"             <th>Note</th>"
	    +"             <th>Edit</th>"
	    +"             <th>Delete</th>"
	    +"        </tr>"
	    +" </table>     "
	    +" <h3>Time ranges</h3>"  
       +" <table class='time-marker-range-list'>"
	   +"         <tr class='time-marker-range-header'>"
	   +"              <th>Time range</th>"
	   +"              <th>Note</th>"
	   +"              <th>Edit</th>"
	   +"              <th>Delete</th>"
	   +"         </tr>"
		+"</table>");
    // TODO: store these individually instead of just using the first element of the array
    self._momentList = $(".time-marker-moment-list", self._container);
    self._moments = [];
    /*_.map(opts.initState[0].moments, function (m) {
        return new self._TimeStamp(m);
    });*/
    self.displayMoments();
	$(".time-marker-moment-list").bind("saveNoteEvent",{obj:self},self.saveNote);
	$(".time-marker-moment-list").bind("deleteNoteEvent",{obj:self},self.deleteNote);
	$(".time-marker-range-list").bind("saveNoteEvent",{obj:self},self.saveNote);
	$(".time-marker-range-list").bind("deleteNoteEvent",{obj:self},self.deleteNote);
    self._start = null;
    self._rangeList = $(".time-marker-range-list", self._container);
    /*self._ranges = _.map(opts.initState[0].ranges, function (r) {
        return new self._TimeRange(r.startT, r.endT);
    });*/
    self._ranges = [];
    self.displayRanges();
};

jQuery.extend(rootNS.TimeMarker.prototype, {
	saveNote: function(e,isRange,id,txt){
	
		num =0;
		if (isRange){
			num = e.data.obj.findNoteById(id,e.data.obj._ranges);
		e.data.obj._ranges[num].saveNote(txt);
		}else{
			
			num = e.data.obj.findNoteById(id,e.data.obj._moments);
			
		e.data.obj._moments[num].saveNote(txt);
		}
		
		
		
	},
	deleteNote: function(e,isRange,id){
		var num = 0;
		if (isRange){
		num = e.data.obj.findNoteById(id,e.data.obj._ranges);
		e.data.obj._ranges.splice(num,1);
		}else{
		num = e.data.obj.findNoteById(id,e.data.obj._moments);
		e.data.obj._moments.splice(num,1);
		}
	},
	findNoteById: function(id,haystack){
				for (var i=0;i<haystack.length;i++){
			if (haystack[i].id==id){
				return i;
			}
		}
		return null;
	},
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
        var uid = 0;
        if (self._moments.length>0){
        	var last = (self._moments.length-1);
        	        	
        	uid = parseInt(self._moments[last].id);
        
        	uid=uid+1;
        }	
        /*insertIntoSorted(self._moments,
            new self._TimeStamp(self._player.getPosition(),uid),
            function (ts){return ts.sortVal();});*/
         self._moments.push(new self._TimeStamp(self._player.getPosition(),uid));   
        self.displayMoments();
    },
    markStartEnd: function() {
        self = this;
          var uid = 0;
        if (self._ranges.length>0){
        	uid = self._ranges[self._ranges.length-1].id+1;
        }	
        if (self._start !== null) {
            /*insertIntoSorted(self._ranges,
                new self._TimeRange(self._start, self._player.getPosition(),uid),
                function (tr){return tr.sortVal();});*/
            self._ranges.push(new self._TimeRange(self._start,self._player.getPosition(),uid));       
            self.displayRanges();
            self._start = null;
        } else {
            self._start = self._player.getPosition();
        }
    },
    displayMoments: function() {
    	var output = ""; 
    	for (var i=0;i<this._moments.length;i++){
    		output += "<tr class='time-marker-moment'><td>"+this._moments[i]+"</td><td><span onclick='changeNote(this,false,"+this._moments[i].id+")'>"+this._moments[i].note+"</span></td><td><a onclick='changeNote(this.parentNode.previousSibling.firstChild,false,"+this._moments[i].id+")' href='#'><img src='chrome://zotero-content/skin/annotate-audio-edit.png' alt='edit' /></a></td><td><a onclick='deleteNote(this,false,"+this._moments[i].id+")' href='#'><img src='chrome://zotero-content/skin/annotate-audio-delete.png' alt='delete' /></a></td></tr>";
    	}
    	
        this._momentList.html(output);
    },
    displayRanges: function() {
        var output="";
                for (var i=0;i<this._ranges.length;i++){
    		output += "<tr class='time-marker-range'><td>"+this._ranges[i]+"</td><td><span onclick='changeNote(this,true,"+this._ranges[i].id+")'>"+this._ranges[i].note+"</span></td><td><a onclick='changeNote(this.parentNode.previousSibling.firstChild,true,"+this._ranges[i].id+")' href='#'><img src='chrome://zotero-content/skin/annotate-audio-edit.png' alt='edit' /></a></td><td><a onclick='deleteNote(this,true,"+this._ranges[i].id+")' href='#'><img src='chrome://zotero-content/skin/annotate-audio-delete.png' alt='delete' /></a></td></tr>";
    	}
        this._rangeList.html(output);
             }
});

})(jQuery, _);
